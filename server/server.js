"use strict";

var loopback = require("loopback");
var boot = require("loopback-boot");
let connectedSocketIp = [];
let connectedPassSocketIp = [];
let driverNamespace, passengerNamespace;

var app = (module.exports = loopback());
app.start = function() {
  // start the web server
  return app.listen(function() {
    app.emit("started");
    var baseUrl = app.get("url").replace(/\/$/, "");
    console.log("Web server listening at: %s", baseUrl);
    if (app.get("loopback-component-explorer")) {
      var explorerPath = app.get("loopback-component-explorer").mountPath;
      console.log("Browse your REST API at %s%s", baseUrl, explorerPath);
    }
  });
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function(err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module) {
    // app.start();
    app.io = require("socket.io", {
      path: "/",
      serveClient: false,
      cookie: false,
      autoConnect: false
    })(app.start());
    let passArr = [];

    exports = module.exports.drivers = driverNamespace = app.io.of("/drivers").to("quickTaxiRoom");
    exports = module.exports.passengers = passengerNamespace = app.io.of("/passengers").to("quickTaxiRoom");
    
    // test code
    // passengerNamespace.on('connection', function(socket){
    //   socket.join('some room');
    //   console.log("jouned")
    //     console.log("hello")

    //     socket.on('my', function () {
    //       let i =1;
    //       setInterval(() => {
    //         passengerNamespace.to('some room').emit('some event', {"i" : i});    
    //         socket.leave('room');
    //         i +=1;
    //       }, 1000);
    //     })
    // });

    exports = module.exports.passengerArr = passArr;

    passengerNamespace.on("connection", function(socket) {
      onePassengerConnectionAtTime(socket, passArr, driverNamespace);
    });

    driverNamespace.on("connection", function(socket) {
      oneConnectionAtTime(socket);
    });
  }
});

function onePassengerConnectionAtTime(socket, passArr, drivers) {
    // socket.join('Quicktaxi');
    // socket.on('my', function () {
    //   let i =1;
    //   setInterval(() => {
    //     passengerNamespace.to('some room').emit('some event', {"i" : i});    
    //     socket.leave('room');
    //     i +=1;
    //   }, 1000);
    // })
  // socket.join('room');

  socket.on("passengerConnected", function(data) {
    // socket.join("quickTaxiRoom")
    // setInterval(() => {
    //       passengerNamespace.emit('event', {"i" : "hamza"});    
    //       // socket.leave('room');
    //       // i +=1;
          
    //     }, 1000);
        // setInterval(() => {
        //   passengerNamespace.leave("quickTaxiRoom")
        // }, 5000)
    if (data.passengerId) {
      let alreadyExist = false;
      if (passArr.length > 0) {
        passArr.forEach((pass, i) => {
          if (pass.passengerId == data.passengerId) alreadyExist = true;
          if (i == passArr.length - 1 && !alreadyExist) {
            passArr.push({
              socket: socket,
              passengerId: data.passengerId
            });
            console.log("new passenger socket connected", socket.id);

            getDriverLocForPassBeforeTrip(socket, data.passengerId, drivers);
            // socket.on("disconnect", function() {
            //   console.log(
            //     "Passenger socket disconnected from server",
            //     socket.id
            //   );
            //   disconnectPassSocketIp(passArr, socket);
            // });
          }
          if (i == passArr.length - 1 && alreadyExist)  socket.disconnect(true);
        });
      } else {
        console.log("new passenger socket connected", socket.id);
        passArr.push({
          socket: socket,
          passengerId: data.passengerId
        });
        getDriverLocForPassBeforeTrip(socket, data.passengerId, drivers);
      }
    }
  });

  socket.on("disconnect", function() {
    console.log("Passenger socket disconnected from server", socket.id);
    disconnectPassSocketIp(passArr, socket);
  });
}

function getDriverLocForPassBeforeTrip(socket, passengerId, drivers) {
  socket.on("getDriverLocBeforeTrip", function(d) {
    drivers.clients((error, clients) => {
      if (error) {
        next(error);
      } else {
        // get driver location event
        // if (clients.length > 0) {
        clients.forEach((clientId, i) => {
            drivers.sockets[clientId].on("getLocOfDriver", function (data) {
            if (data.lat && data.lng && data.driverId) socket.emit('driverCurrLoc',data)
          })
          drivers.sockets[clientId].emit("sendYourLocToServer", {})
        });
      }
    });
  });
}

function disconnectPassSocketIp(passArr, socket) {
  passArr.forEach((pass, j) => {
    if (pass.socket.id == socket.id) passArr.splice(j, 1);
  });
}

function oneConnectionAtTime(socket) {
  socket.on("driverConnected", function(data) {
    let alreadyExist = false;
    if (data.macAddr && data.driverId) {
      if (connectedSocketIp.length > 0) {
        connectedSocketIp.forEach((mac, i) => {
          if (mac == data.macAddr) alreadyExist = true;
          if (i == connectedSocketIp.length - 1 && !alreadyExist) {
            connectedSocketIp.push({ mac: data.macAddr, socket: socket });
            console.log("new driver socket connected", socket.id);
          }
          if (i == connectedSocketIp.length - 1 && alreadyExist)
            socket.disconnect(true);
        });
      } else {
        connectedSocketIp.push({ mac: data.macAddr, socket: socket });
        console.log("new driver socket connected", socket.id);
      }
    }
  });

  socket.on("disconnect", function() {
    console.log("Driver socket disconnected from server");
    disconnectSocketIp(socket);
  });
}

function disconnectSocketIp(socket) {
  connectedSocketIp.forEach((scIp, i) => {
    if (scIp.socket.id == socket.id) connectedSocketIp.splice(i, 1);
  });
}

// "url": "mongodb+srv://quick_taxt:quick_taxi@quicktaxi-y01kw.mongodb.net/test?retryWrites=true",

// "host" : "localhost",
//     "port" : 27017,
