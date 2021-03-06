/*global window: false*/

function updateAjaxURL(prefix) {
  if (prefix) {
    $.ajaxPrefilter(function (options) {
      var target = options.url;
      if (target.indexOf('/') === 0) {
        if (target.indexOf(prefix + '/') !== 0) {
          options.url = prefix + target;
        }
      }
    });
  }
}

function ajax401(prefix) {
  $(document).ajaxError(function (event, jqXHR) {
    if (jqXHR.status >= 400) {
      if (jqXHR.status === 401) {
        $('#message').append('<div class="alert alert-error"><button class="close" data-dismiss="alert">x</button>Please click <a href="' + prefix + '/login" target="_blank">traveler log in</a>, and then save the changes on this page.</div>');
      } else {
        $('#message').append('<div class="alert alert-error"><button class="close" data-dismiss="alert">x</button>HTTP request failed.</div>');
      }
      $(window).scrollTop($('#message div:last-child').offset().top - 40);
    }
  });
}

function disableAjaxCache() {
  var ua = window.navigator.userAgent;
  var msie = ua.indexOf("MSIE ");
  if (msie > 0) {
    $.ajaxSetup({
      cache: false
    });
  }
}
