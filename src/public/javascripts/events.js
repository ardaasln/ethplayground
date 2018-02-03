$(document).ready(function() {
  setInterval(function() {
    $.get('latestblock', function(result) {
      $('#latestblocknumber').val(result.message);
    });
  }, 1000);
});


