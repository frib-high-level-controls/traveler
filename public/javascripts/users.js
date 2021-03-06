/*global selectColumn: false, useridColumn: false, fullNameNoLinkColumn: false, rolesColumn: false, lastVisitedOnColumn: false, fnGetSelected: false, selectEvent: false, filterEvent: false, sDomNoTools: false, fnAddFilterFoot: false*/
/*global updateAjaxURL: false, basePath: false, Holder: false*/
/*global travelerGlobal: false*/

function inArray(name, ao) {
  var i;
  for (i = 0; i < ao.length; i += 1) {
    if (ao[i].name === name) {
      return true;
    }
  }
  return false;
}

function updateFromModal(cb) {
  $('#remove').prop('disabled', true);
  var number = $('#modal .modal-body div').length;
  $('#modal .modal-body div').each(function () {
    var that = this;
    $.ajax({
      url: basePath + '/users/' + that.id + '/refresh',
      type: 'GET'
    }).done(function () {
      $(that).prepend('<i class="fa fa-check"></i>');
      $(that).addClass('text-success');
    }).fail(function (jqXHR) {
      $(that).append(' : ' + jqXHR.responseText);
      $(that).addClass('text-error');
    }).always(function () {
      number = number - 1;
      if (number === 0) {
        if (cb) {
          cb();
        }
      }
    });
  });
}

function modifyFromModal(cb) {
  $('#remove').prop('disabled', true);
  var number = $('#modal .modal-body div').length;
  var roles = [];
  $('#modal-roles input:checked').each(function () {
    roles.push($(this).val());
  });
  $('#modal .modal-body div').each(function () {
    var that = this;
    $.ajax({
      url: basePath + '/users/' + that.id,
      type: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify({
        roles: roles
      })
    }).done(function () {
      $(that).prepend('<i class="fa fa-check"></i>');
      $(that).addClass('text-success');
    }).fail(function (jqXHR) {
      $(that).append(' : ' + jqXHR.responseText);
      $(that).addClass('text-error');
    }).always(function () {
      number = number - 1;
      if (number === 0) {
        if (cb) {
          cb();
        }
      }
    });
  });
}

$(function () {
  // updateAjaxURL(basePath);

  travelerGlobal.usernames.initialize();

  $('#username').typeahead({
    minLength: 1,
    highlight: true,
    hint: true
  }, {
    name: 'usernames',
    display: 'displayName',
    limit: 20,
    source: travelerGlobal.usernames
  });

  var userColumns = [selectColumn, useridColumn, fullNameNoLinkColumn, rolesColumn, lastVisitedOnColumn];

  var userTable = $('#users-table').dataTable({
    sAjaxSource: basePath + '/users/json',
    sAjaxDataProp: '',
    fnInitComplete: function () {
      Holder.run({
        images: 'img.user'
      });
    },
    bAutoWidth: false,
    iDisplayLength: 10,
    aLengthMenu: [
      [10, 50, 100, -1],
      [10, 50, 100, 'All']
    ],
    oLanguage: {
      sLoadingRecords: 'Please wait - loading data from the server ...'
    },
    bDeferRender: true,
    aoColumns: userColumns,
    aaSorting: [
      [4, 'desc']
    ],
    sDom: sDomNoTools
  });
  fnAddFilterFoot('#users-table', userColumns);
  selectEvent();
  filterEvent();

  $('#add').click(function (e) {
    e.preventDefault();
    var name = $('#username').val();
    if (inArray(name, userTable.fnGetData())) {
      //show message
      $('#message').append('<div class="alert alert-info"><button class="close" data-dismiss="alert">x</button>The user named <strong>' + name + '</strong> is already in the user list. </div>');
    } else {
      $.ajax({
        url: basePath + '/users',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          name: name,
          manager: $('#manager').prop('checked'),
          admin: $('#admin').prop('checked')
        }),
        success: function (data, status, jqXHR) {
          $('#message').append('<div class="alert alert-success"><button class="close" data-dismiss="alert">x</button>' + jqXHR.responseText + '</div>');
          userTable.fnReloadAjax();
        },
        error: function (jqXHR) {
          $('#message').append('<div class="alert alert-error"><button class="close" data-dismiss="alert">x</button>Cannot update the share list : ' + jqXHR.responseText + '</div>');
        }
      });
    }
    document.forms[0].reset();
  });

  $('#user-update').click(function () {
    var selected = fnGetSelected(userTable, 'row-selected');
    if (selected.length) {
      $('#modalLabel').html('Update the following ' + selected.length + ' users from the application? ');
      $('#modal .modal-body').empty();
      selected.forEach(function (row) {
        var data = userTable.fnGetData(row);
        $('#modal .modal-body').append('<div id="' + data._id + '">' + data.name + '</div>');
      });
      $('#modal .modal-footer').html('<button id="update" class="btn btn-primary">Confirm</button><button data-dismiss="modal" aria-hidden="true" class="btn">Return</button>');
      $('#update').click(function (e) {
        e.preventDefault();
        $('#update').prop('disabled', true);
        updateFromModal(function () {
          userTable.fnReloadAjax();
        });
      });
      $('#modal').modal('show');
    } else {
      $('#modalLabel').html('Alert');
      $('#modal .modal-body').html('No users has been selected!');
      $('#modal .modal-footer').html('<button data-dismiss="modal" aria-hidden="true" class="btn">Return</button>');
      $('#modal').modal('show');
    }
  });

  $('#user-modify').click(function () {
    var selected = fnGetSelected(userTable, 'row-selected');
    if (selected.length) {
      $('#modalLabel').html('Modify the following ' + selected.length + ' users\' role? ');
      $('#modal .modal-body').empty();
      $('#modal .modal-body').append('<form id="modal-roles" class="form-inline"><label class="checkbox"><input id="modal-manager" type="checkbox" value="manager">manager</label> <label class="checkbox"><input id="modal-admin" type="checkbox" value="admin">admin</label> </form>');
      selected.forEach(function (row) {
        var data = userTable.fnGetData(row);
        $('#modal .modal-body').append('<div id="' + data._id + '">' + data.name + '</div>');
      });
      $('#modal .modal-footer').html('<button id="modify" class="btn btn-primary">Confirm</button><button data-dismiss="modal" aria-hidden="true" class="btn">Return</button>');
      $('#modify').click(function (e) {
        e.preventDefault();
        $('#modify').prop('disabled', true);
        modifyFromModal(function () {
          userTable.fnReloadAjax();
        });
      });
      $('#modal').modal('show');
    } else {
      $('#modalLabel').html('Alert');
      $('#modal .modal-body').html('No users has been selected!');
      $('#modal .modal-footer').html('<button data-dismiss="modal" aria-hidden="true" class="btn">Return</button>');
      $('#modal').modal('show');
    }
  });
});
