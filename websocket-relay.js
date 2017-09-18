// Use the websocket-relay to serve a raw MPEG-TS over WebSockets. You can use
// ffmpeg to feed the relay. ffmpeg -> websocket-relay -> browser
// Example:
// node websocket-relay yoursecret 8081 8082
// ffmpeg -i <some input> -f mpegts http://localhost:8081/yoursecret

var fs = require('fs'),
	http = require('http'),
	WebSocket = require('ws');
	var pusage = require('pidusage');
	var readdir = require('fs').readdir;

if (process.argv.length < 4) {
	console.log(
		'Usage: \n' +
		'node websocket-relay.js <secret> [<stream-port> <websocket-port>]'
	);
	process.exit();
}

//streaming video data
var STREAM_SECRET = process.argv[2],
	STREAM_LPORT = process.argv[3] || 8081,
	WEBSOCKET_STRPORT = process.argv[4] || 8082,
	WEBSOCKET_STAPORT = process.argv[5],
	RECORD_STREAM = false;

// Websocket Server
var socketServer = new WebSocket.Server({port: WEBSOCKET_STRPORT, perMessageDeflate: false});
socketServer.connectionCount = 0;
socketServer.on('connection', function(socket, upgradeReq) {
	socketServer.connectionCount++;
	console.log(
		'New WebSocket Connection: ',
		(upgradeReq || socket.upgradeReq).socket.remoteAddress,
		(upgradeReq || socket.upgradeReq).headers['user-agent'],
		'('+socketServer.connectionCount+' total)'
	);
	socket.on('close', function(code, message){
		socketServer.connectionCount--;
		console.log(
			'Disconnected WebSocket ('+socketServer.connectionCount+' total)'
		);
	});
});
socketServer.broadcast = function(data) {
	socketServer.clients.forEach(function each(client) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(data);
		}
	});
};

// HTTP Server to accept incomming MPEG-TS Stream from ffmpeg
var streamServer = http.createServer( function(request, response) {
	var params = request.url.substr(1).split('/');

	if (params[0] !== STREAM_SECRET) {
		console.log(
			'Failed Stream Connection: '+ request.socket.remoteAddress + ':' +
			request.socket.remotePort + ' - wrong secret.'
		);
		response.end();
	}

	response.connection.setTimeout(0);
	console.log(
		'Stream Connected: ' +
		request.socket.remoteAddress + ':' +
		request.socket.remotePort
	);
	request.on('data', function(data){
		socketServer.broadcast(data);
		if (request.socket.recording) {
			request.socket.recording.write(data);
		}
	});
	request.on('end',function(){
		console.log('close');
		if (request.socket.recording) {
			request.socket.recording.close();
		}
	});

	// Record the stream to a local file?
	if (RECORD_STREAM) {
		var path = 'recordings/' + Date.now() + '.ts';
		request.socket.recording = fs.createWriteStream(path);
	}
}).listen(STREAM_LPORT);

console.log('Listening for incomming MPEG-TS Stream on http://127.0.0.1:'+STREAM_LPORT+'/<secret>');
console.log('Awaiting WebSocket connections on ws://127.0.0.1:'+WEBSOCKET_STRPORT+'/');

/* Streaming server monitoring statistics */
//var pusage = require('pidusage');
//var readdir = require('fs').readdir;
//var WebSocket = require('ws');

// Compute statistics every second:
var data = {};
console.log('process.argv[3]', WEBSOCKET_STAPORT);

var wss = new WebSocket.Server({ port: WEBSOCKET_STAPORT, perMessageDeflate: false });
wss.connectionCount = 0;
wss.on('connection', function connection(ws) {
  wss.connectionCount++;
  console.log('Total websocket connection: ', wss.connectionCount);

  ws.on('message', function(msg){
    console.log('new client connected', msg);
  });
  ws.on('close', function(code, message){
		wss.connectionCount--;
		console.log('Disconnected WebSocket ('+wss.connectionCount+' total)'
		);
	});
});

//setTimeout(function(){scanServer(statServer, i)}, 5000);

setInterval(function() {
  pusage.stat(process.pid, function(err, stat) {
    if (err) throw err;
    data.cpu = stat.cpu;
  });
	readdir('/proc/self/fd', function(err, list) {
    if (err) throw err;
      data.openfd = list.length;
      console.log(data);
    });
	broadcast(JSON.stringify(data));
}, 10000);

function broadcast(data) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      if (data.cpu !== null && data.openfd !== null)
        client.send(data);
      //console.log(data);
      console.log(pusage.data);
    }
  });
}
/*
pusage.stat(process.pid, function(err, stat) {
  if (err) throw err;
  data.cpu = stat.cpu;
  console.log ('data: ', data);
});
readdir('/proc/self/fd', function(err, list) {
  if (err) throw err;
  data.openfd = list.length;
});
*/
