var http = require('http');

var handleRequest = function(request, response) {
  console.log('Received request for URL: ' + request.url);
  response.writeHead(200);
  response.end('Hello World!');
};

console.log('Starting Server on port 8080...');
var www = http.createServer(handleRequest).listen(8080, function(){
    console.log('OK. HTTP server started');
});

var sockets = {}, nextSocketId = 0;
www.on('connection', function (socket) {
    var socketId = nextSocketId++;
    sockets[socketId] = socket;
    console.log('socket', socketId, 'opened');

    socket.on('close', function () {
        console.log('socket', socketId, 'closed');
        delete sockets[socketId];
    });
});

var end = function(){
    www.close(function () {
        console.log('...app is shutting down');
        process.exit(0);
    });
    for (var socketId in sockets) {
        console.log('socket connection', socketId, 'destroyed');
        sockets[socketId].destroy();
    }
};
process.on('SIGTERM', function () {
    console.log('SIGTERM issued... ');
    end();
});

process.on('SIGINT', function() {
    console.log('SIGINT issued... ');
    end();
});
