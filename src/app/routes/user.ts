/**
 * Implement User route handlers
 */
import * as fs from 'fs';

import * as express from 'express';

import {
  error,
} from '../shared/logging';

import * as auth from '../lib/auth';
import * as ldapjs from '../lib/ldap-client';

import {
  User,
} from '../model/user';

type Request = express.Request;
type Response = express.Response;

interface ADConfig {
  searchFilter: string;
  rawAttributes: string[];
  objAttributes: string[];
  searchBase: string;
  nameFilter: string;
  groupSearchFilter: string;
  groupSearchBase: string;
  groupAttributes: string[];
}

const pendingPhotos = {};

const options = {
  root: '',
  maxAge: 0,
};

export function setUserPhotoCacheRoot(path: string) {
  options.root = path;
}

export function setUserPhotoCacheMaxAge(age: number) {
  options.maxAge = age;
}

let serviceUrl = '';

export function getServiceUrl(): string {
  return serviceUrl;
}

export function setServiceUrl(url: string) {
  serviceUrl = url;
}

let ad: ADConfig;

export function setADConfig(config: ADConfig) {
  ad = config;
}

let ldapClient: ldapjs.Client;

export function setLDAPClient(client: ldapjs.Client) {
  ldapClient = client;
}


function cleanList(id, f) {
  const reslist = pendingPhotos[id];
  delete pendingPhotos[id];
  reslist.forEach(f);
}

function fetch_photo_from_ad(id: string) {
  const searchFilter = ad.searchFilter.replace('_id', id);
  const opts = {
    filter: searchFilter,
    attributes: ad.rawAttributes,
    scope: 'sub',
  };
  ldapClient.legacySearch(ad.searchBase, opts, true, (err, result) => {
    if (err) {
      error(err);
      cleanList(id, (res) => {
        return res.status(500).send('ldap error');
      });
    } else if (result.length === 0) {
      cleanList(id, (res) => {
        return res.status(400).send(id + ' is not found');
      });
    } else if (result.length > 1) {
      cleanList(id, (res) => {
        return res.status(400).send(id + ' is not unique!');
      });
    } else if (result[0].thumbnailPhoto && result[0].thumbnailPhoto.length) {
      if (!fs.existsSync(options.root + id + '.jpg')) {
        fs.writeFile(options.root + id + '.jpg', result[0].thumbnailPhoto, (fsErr) => {
          if (fsErr) {
            error(fsErr);
          }
          cleanList(id, (res) => {
            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=' + options.maxAge);
            return res.send(result[0].thumbnailPhoto);
          });
        });
      } else {
        cleanList(id, (res) => {
          res.set('Content-Type', 'image/jpeg');
          res.set('Cache-Control', 'public, max-age=' + options.maxAge);
          return res.send(result[0].thumbnailPhoto);
        });
      }
    } else {
      cleanList(id, (res) => {
        return res.status(400).send(id + ' photo is not found');
      });
    }
  });
}

function updateUserProfile(user: User, res: Response) {
  const searchFilter = ad.searchFilter.replace('_id', user._id);
  const opts = {
    filter: searchFilter,
    attributes: ad.objAttributes,
    scope: 'sub',
  };
  ldapClient.legacySearch(ad.searchBase, opts, false, (ldapErr, result) => {
    if (ldapErr) {
      return res.status(500).json(ldapErr);
    }
    if (result.length === 0) {
      return res.status(500).json({
        error: user._id + ' is not found!',
      });
    }
    if (result.length > 1) {
      return res.status(500).json({
        error: user._id + ' is not unique!',
      });
    }
    user.update({
      name: result[0].displayName,
      email: result[0].mail,
      office: result[0].physicalDeliveryOfficeName,
      phone: result[0].telephoneNumber,
      mobile: result[0].mobile,
    }, (err) => {
      if (err) {
        return res.status(500).json(err);
      }
      return res.send(204);
    });
  });
}


function addUser(req: Request, res: Response) {
  const nameFilter = ad.nameFilter.replace('_name', req.body.name);
  const opts = {
    filter: nameFilter,
    attributes: ad.objAttributes,
    scope: 'sub',
  };

  ldapClient.legacySearch(ad.searchBase, opts, false, (ldapErr, result) => {
    if (ldapErr) {
      error(ldapErr.name + ' : ' + ldapErr.message);
      return res.status(500).json(ldapErr);
    }

    if (result.length === 0) {
      return res.status(404).send(req.body.name + ' is not found in AD!');
    }

    if (result.length > 1) {
      return res.status(400).send(req.body.name + ' is not unique!');
    }
    const roles = [];
    if (req.body.manager) {
      roles.push('manager');
    }
    if (req.body.admin) {
      roles.push('admin');
    }
    const user = new User({
      _id: result[0].sAMAccountName.toLowerCase(),
      name: result[0].displayName,
      email: result[0].mail,
      office: result[0].physicalDeliveryOfficeName,
      phone: result[0].telephoneNumber,
      mobile: result[0].mobile,
      roles: roles,
    });

    user.save((err, newUser) => {
      if (err) {
        error(err);
        return res.status(500).send(err.message);
      }
      const url = serviceUrl + '/users/' + newUser._id;
      res.set('Location', url);
      return res.status(201).send('The new user is at <a target="_blank" href="' + url + '">' + url + '</a>');
    });

  });
}

export function init(app: express.Application) {

  app.get('/usernames/:name', auth.ensureAuthenticated, (req, res) => {
    User.findOne({
      name: req.params.name,
    }).exec((err, user) => {
      if (err) {
        error(err);
        return res.status(500).send(err.message);
      }
      if (user) {
        return res.render('user', {
          user: user,
          myRoles: req.session.roles,
          // prefix: req.proxied ? req.proxied_prefix : ''
          prefix: '',
        });
      }
      return res.status(404).send(req.params.name + ' not found');
    });
  });


  app.post('/users', auth.ensureAuthenticated, (req, res) => {

    if (req.session.roles === undefined || req.session.roles.indexOf('admin') === -1) {
      return res.status(403).send('only admin allowed');
    }

    if (!req.body.name) {
      return res.status(400).send('need to know name');
    }

    // check if already in db
    User.findOne({
      name: req.body.name,
    }).exec((err, user) => {
      if (err) {
        return res.status(500).send(err.message);
      }
      if (user) {
        const url = serviceUrl + '/users/' + user._id;
        return res.status(200).send('The user is at <a target="_blank" href="' + url + '">' + url + '</a>');
      }
      addUser(req, res);
    });

  });

  app.get('/users/json', auth.ensureAuthenticated, (req, res) => {
    if (req.session.roles === undefined || req.session.roles.indexOf('admin') === -1) {
      return res.status(403).send('You are not authorized to access this resource. ');
    }
    User.find().exec((err, users) => {
      if (err) {
        error(err);
        return res.status(500).json({
          error: err.message,
        });
      }
      res.json(users);
    });
  });


  app.get('/users/:id', auth.ensureAuthenticated, (req, res) => {
    User.findOne({
      _id: req.params.id,
    }).exec((err, user) => {
      if (err) {
        error(err);
        return res.status(500).send(err.message);
      }
      if (user) {
        return res.render('user', {
          user: user,
          myRoles: req.session.roles,
          // prefix: req.proxied ? req.proxied_prefix : ''
          prefix: '',
        });
      }
      return res.status(404).send(req.params.id + ' has never logged into the application.');
    });
  });

  app.put('/users/:id', auth.ensureAuthenticated, (req, res) => {
    if (req.session.roles === undefined || req.session.roles.indexOf('admin') === -1) {
      return res.status(403).send('You are not authorized to access this resource. ');
    }
    if (!req.is('json')) {
      return res.status(415).json({
        error: 'json request expected.',
      });
    }
    User.findOneAndUpdate({
      _id: req.params.id,
    }, req.body).exec((err) => {
      if (err) {
        error(err);
        return res.status(500).json({
          error: err.message,
        });
      }
      return res.send(204);
    });
  });

  // get from the db not ad
  app.get('/users/:id/json', auth.ensureAuthenticated, (req, res) => {
    User.findOne({
      _id: req.params.id,
    }).exec((err, user) => {
      if (err) {
        error(err);
        return res.status(500).json({
          error: err.message,
        });
      }
      return res.json(user);
    });
  });

  app.get('/users/:id/refresh', auth.ensureAuthenticated, (req, res) => {
    if (req.session.roles === undefined || req.session.roles.indexOf('admin') === -1) {
      return res.status(403).send('You are not authorized to access this resource. ');
    }
    User.findOne({
      _id: req.params.id,
    }).exec((err, user) => {
      if (err) {
        error(err);
        return res.status(500).send(err.message);
      }
      if (user) {
        updateUserProfile(user, res);
      } else {
        return res.status(404).send(req.params.id + ' is not in the application.');
      }
    });
  });


  // resource /adusers

  app.get('/adusers', auth.ensureAuthenticated, (req, res) => {
    return res.status(200).send('Please provide the user id');
  });

  app.get('/adusers/:id', auth.ensureAuthenticated, (req, res) => {

    const searchFilter = ad.searchFilter.replace('_id', req.params.id);
    const opts = {
      filter: searchFilter,
      attributes: ad.objAttributes,
      scope: 'sub',
    };
    ldapClient.legacySearch(ad.searchBase, opts, false, (err, result) => {
      if (err) {
        return res.status(500).json(err);
      }
      if (result.length === 0) {
        return res.status(500).json({
          error: req.params.id + ' is not found!',
        });
      }
      if (result.length > 1) {
        return res.status(500).json({
          error: req.params.id + ' is not unique!',
        });
      }

      return res.json(result[0]);
    });

  });


  app.get('/adusers/:id/photo', auth.ensureAuthenticated, (req, res) => {
    if (fs.existsSync(options.root + req.params.id + '.jpg')) {
      return res.sendfile(req.params.id + '.jpg', options);
    } else if (pendingPhotos[req.params.id]) {
      pendingPhotos[req.params.id].push(res);
    } else {
      pendingPhotos[req.params.id] = [res];
      fetch_photo_from_ad(req.params.id);
    }
  });

  app.get('/adusernames', auth.ensureAuthenticated, (req, res) => {
    const query = req.query.term;
    let nameFilter;
    let opts;
    if (query && query.length > 0) {
      nameFilter = ad.nameFilter.replace('_name', query + '*');
    } else {
      nameFilter = ad.nameFilter.replace('_name', '*');
    }
    opts = {
      filter: nameFilter,
      attributes: ['displayName'],
      paged: {
        pageSize: 200,
      },
      scope: 'sub',
    };
    ldapClient.legacySearch(ad.searchBase, opts, false, (err, result) => {
      if (err) {
        return res.status(500).json(err);
      }
      if (result.length === 0) {
        return res.json([]);
      }
      return res.json(result);
    });
  });

  app.get('/adgroups', auth.ensureAuthenticated, (req, res) => {
    const query = req.query.term;
    let filter;
    let opts;
    if (query && query.length > 0) {
      if (query[query.length - 1] === '*') {
        filter = ad.groupSearchFilter.replace('_id', query);
      } else {
        filter = ad.groupSearchFilter.replace('_id', query + '*');
      }
    } else {
      filter = ad.groupSearchFilter.replace('_id', '*');
    }
    opts = {
      filter: filter,
      attributes: ad.groupAttributes,
      scope: 'sub',
    };
    ldapClient.legacySearch(ad.groupSearchBase, opts, false, (err, result) => {
      if (err) {
        return res.status(500).send(err.message);
      }
      if (result.length === 0) {
        return res.json([]);
      }
      return res.json(result);
    });
  });
}