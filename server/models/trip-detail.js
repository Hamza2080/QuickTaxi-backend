// on_ride, accepted, pending, ride_end...

/**
 * pk_test_YYjEaUcpgvofJHLL9t8MIDId00ql282V8Y => stripe test key
 * sk_test_b3nFIQe5Ia2C71VrKw5gvUvs00vgNTEllq => secret
 */

"use strict";
let websockets = require("../server.js");
var CronJob = require('cron').CronJob;
let passenger = require("../models/passenger");
let passengerNamespace;
let connectedPassengers;
let connectedSocketIp = []; // restrict one user to have only one connection => using handshake address
let passengerSockets = []; // passenger socket with passenger id
const GoogleDistanceApi = require("google-distance-api");
// const stripe = require("stripe")("sk_test_b3nFIQe5Ia2C71VrKw5gvUvs00vgNTEllq");
let async = require("async");
let app = require("../server");
/**
 * ride_now, ride_later
 */

module.exports = function(Tripdetail) {

  // const stripe = require("stripe")(
  //   "sk_test_b3nFIQe5Ia2C71VrKw5gvUvs00vgNTEllq"
  // );

  Tripdetail.beforeRemote("create", function(ctx, modelInstance, next) {
    connectedPassengers = websockets.passengerArr;
    next();
  });
  /**
   * after remote hook on create method
   */
  Tripdetail.afterRemote("create", function(ctx, modelInstance, next) {
    if (
      modelInstance &&
      modelInstance.__data.pickupLatitude &&
      modelInstance.__data.pickupLongitude &&
      modelInstance.__data.tripType == "ride_now"
    ) {
      makeRequestProces(modelInstance, next);
    } else if (
      modelInstance &&
      modelInstance.__data.pickupLatitude &&
      modelInstance.__data.pickupLongitude &&
      modelInstance.__data.tripType == "ride_schedule"
    ){
      let date = new Date(modelInstance.__data.pickupDateTime);
      let second=date.getUTCSeconds() //0-59
      let minute=date.getUTCMinutes() //0-59
      let hour = date.getUTCHours() //0-23
      let day = date.getUTCDate() //e.g. thursday
      let weekday  = date.getUTCDay() //28
      let month = date.getUTCMonth() //0-11

      // new CronJob(date , function() {
      //   console.log('You will see this message every second');
      // }, null, true, 'America/Los_Angeles');
      // next();
      ///else condition of if
    } else next()
  });

  /**
   * makeRequestProcess
   */
  function makeRequestProces(modelInstance, next) {
    modelInstance.__data.pickupDateTime = new Date();
    let availableDriversArray = [];
    let tripRequestSendArray = [];
    let reqDistance = 5;
    let tripVariable = {
      accepted: false,
      canceled: false
    };
    // let {tripAccepted} = false;

    cancelTripByPasseger(modelInstance.__data, tripVariable);
    // get al connected socket client
    websockets.drivers.clients((error, clients) => {
      if (error) {
        next(error);
      } else {
        // get driver location event
        // if (clients.length > 0) {
        clients.forEach((clientId, i) => {
          websockets.drivers.sockets[clientId].on(
            "getDriverCurrLocation",
            function getDriverLocation(data1) {
              websockets.drivers.sockets[clientId].removeListener(
                "getDriverCurrLocation",
                getDriverLocation
              );
              async.waterfall([
                function (callback) {
                  filterTripReq (modelInstance, data1, callback)
                },
                function(filtered, callback) {
                  if (filtered) {
                    if (
                      data1.driverId &&
                      data1.lat &&
                      data1.lng &&
                      !tripVariable.canceled
                    ) {
                      // AIzaSyAFHLl55ywLRChj5BBVSV-SmC7spIvR57I
                      const options = {
                        key: "AIzaSyAFHLl55ywLRChj5BBVSV-SmC7spIvR57I",
                        origins: [
                          modelInstance.__data.pickupLatitude +
                            "," +
                            modelInstance.__data.pickupLongitude
                        ],
                        destinations: [data1.lat + "," + data1.lng]
                      };
                      GoogleDistanceApi.distance(options, (err, data) => {
                        if (err) emitErrorToDriver(clientId, err);
                        else {
                          let distance = parseFloat(data[0].distance.split(" ")[0]);
      
                          if (
                            distance <= reqDistance ||
                            data[0].distance.split(" ")[1] == "m"
                          ) {
                            tripRequestSendArray.push({
                              socket: clientId,
                              driverId: data1.dirverId,
                              trip: modelInstance.__data,
                              lat: data1.lat,
                              lng: data1.lng,
                              distance: data[0].distance
                            });
                            sendTripRequest(
                              clientId,
                              modelInstance.__data,
                              data[0].distance,
                              tripVariable,
                              data1.driverId,
                              availableDriversArray,
                              tripRequestSendArray
                            );
                            if (i == clients.length - 1) {
                              sendTripReqToFarDriver(
                                reqDistance,
                                tripVariable,
                                availableDriversArray,
                                tripRequestSendArray
                              );
                            }
                          } else {
                            availableDriversArray.push({
                              socket: clientId,
                              driverId: data.dirverId,
                              trip: modelInstance.__data,
                              lat: data1.lat,
                              lng: data1.lng,
                              driverId: data1.driverId,
                              distance: data[0].distance,
                              tripVariable: tripVariable
                            });
                            if (i == clients.length - 1) {
                              sendTripReqToFarDriver(
                                reqDistance,
                                tripVariable,
                                availableDriversArray,
                                tripRequestSendArray
                              );
                            }
                            /**
                             * asynchronous call error
                             */
                          }
                        }
                      });
                    } else
                      emitErrorToDriver(
                        clientId,
                        "incomplete data send to server, some fields are missing"
                      );
                  } 
                }
              ])
            }
          );
          sendTripIdToDriver(clientId, modelInstance.__data.id);
        });
        next();
        // } else {
        //   noDriverAvailable(modelInstance.__data.passengerId);
        //   //throw an error to passenger that no driver available right now
        // }
      }
    });
  }

  /**
   *  filterTripReq
   */
  function filterTripReq(modelInstance, data, cb) {
    let favourite_driver_check = false;
    let five_star_driver = false;
    let childSeat = false;
    let smallPet = false;

    async.waterfall([
      function (callback) {
        //favourite driver check
        if (modelInstance.fav_driver){
          Tripdetail.app.models.passenger.findById(modelInstance.passengerId, function (error, pass) {
            if (error) cb(err)
            else if (pass.__data) {
              pass.__data.favourite_driver.forEach((favourite_driver_elem, i) => {
                if (favourite_driver_elem == data.driverId)
                  favourite_driver_check = true
                if (i == pass.__data.favourite_driver.length) callback()
              });
            }
          })
        } else {
          favourite_driver_check = true
          callback()
        }
      }, 
      function (callback) {
        //child seat check
        if (modelInstance.childSeat){
          Tripdetail.app.models.driver.findById(data.driverId, function (error, driver) {
            if (error) cb(err)
            else if (driver.__data) {
              if (driver.__data.child_seat) {
                childSeat = true;
                callback();
              } else callback();
            }
          })
        } else {
          childSeat = true
          callback()
        }
      },
      function (callback) {
        //small Pet check
        if (modelInstance.smallPet){
          Tripdetail.app.models.driver.findById(data.driverId, function (error, driver) {
            if (error) cb(err)
            else if (driver.__data) {
              if (driver.__data.allow_pets) {
                smallPet = true;
                callback();
              } else callback();
            }
          })
        } else {
          smallPet = true
          callback()
        }
      },
      function (callback) {
        //5 star rating check
        if (modelInstance["five_star_driver"]){
          Tripdetail.app.models.driver.findById(data.driverId, function (error, driver) {
            if (error) cb(err)
            else if (driver.__data) {
              let rating =
                      5 * driver.__data.rating["5"] +
                      4 * driver.__data.rating["4"] +
                      3 * driver.__data.rating["3"] +
                      2 * driver.__data.rating["2"] +
                      1 * driver.__data.rating["1"];

              rating /=
                driver.__data.rating["5"] +
                driver.__data.rating["4"] +
                driver.__data.rating["3"] +
                driver.__data.rating["2"] +
                driver.__data.rating["1"];

              if (rating > 4) {
                five_star_driver = true
                callback()
              }
              else callback()
            }
          })
        } else {
          five_star_driver = true
          callback()
        }
      },
      function (callback) {
        if (favourite_driver_check && five_star_driver && childSeat) cb(null, true)
        else cb ("not validated")
      }
    ])
  }


  /**
   * cancel ride event
   */
  function cancelTripByPasseger(trip, tripVariable) {
    connectedPassengers.forEach(allPass => {
      if (allPass.passengerId == trip.passengerId) {
        allPass.socket.on("cancelTrip_" + trip.id, function tripCancelByPAss(
          socket
        ) {
          tripVariable.canceled = true;
          websockets.drivers.emit("tripCanceled_" + trip.id, {
            message: "Trip request canceled by passenger"
          });
          allPass.socket.removeListener(
            "cancelTrip_" + trip.id,
            tripCancelByPAss
          );

          //remove all listener from passenger
          // allPass.socket.removeAllListeners();
        });
      }
    });
  }

  function cancelRideByDriverEvent(trip, tripVariable, clientId, callback) {
    websockets.drivers.sockets[clientId].on(
      "cancelTrip_" + trip.id,
      function tripCancelByDriver() {
        tripVariable.canceled = true;
        connectedPassengers.forEach(allPass => {
          if (trip.passengerId == allPass.passengerId)
            allPass.socket.emit("tripCanceled_" + trip.id, {
              message: "Trip canceled by driver"
            });
        });
        websockets.drivers.sockets[clientId].removeAllListeners();
      }
    );
    callback();
  }

  /**
   * send trip request to drivers that are away from 5 km
   * @param {*} reqDistance
   * @param {*} tripVariable => contains accepted and canceled values
   * @param {*} availableDriversArray
   * @param {*} tripRequestSendArray
   */
  function sendTripReqToFarDriver(
    reqDistance,
    tripVariable,
    availableDriversArray,
    tripRequestSendArray
  ) {
    if (availableDriversArray.length > 0 && !tripVariable.canceled) {
      let farDriverInterval = setInterval(() => {
        reqDistance += 5;
        if (reqDistance > 50 && !tripVariable.accepted) {
          clearInterval(farDriverInterval);
          //throw an error to passenger that no driver available right now
        } else {
          availableDriversArray.forEach((driver, i) => {
            if (
              !tripVariable.accepted &&
              driver.distance.split(" ")[0] <= reqDistance
            ) {
              availableDriversArray.splice(i, 1);
              tripRequestSendArray.push({
                socket: driver.socket,
                driverId: driver.dirverId,
                trip: driver.trip,
                lat: driver.lat,
                lng: driver.lng,
                distance: driver.distance
              });
              sendTripRequest(
                driver.socket,
                driver.trip,
                driver.distance,
                tripVariable,
                driver.driverId,
                availableDriversArray
              );
            }
          });
        }
      }, 1000);
    } else {
      //throw an error to passenger that no driver available right now
    }
  }

  function sendTripRequest(
    clientId,
    trip,
    distance,
    tripVariable,
    driverId,
    availableDriversArray,
    tripRequestSendArray
  ) {
    let passengerContact = "";
    let full_name = "";
    async.waterfall([
      function(callback) {
        Tripdetail.app.models.passenger.findById(trip.passengerId, function(
          error,
          passenger
        ) {
          if (error) throw error;
          else if (passenger.__data) {
            passengerContact = passenger.__data.phone;
            full_name = passenger.__data.full_name
          }
          callback();
        });
      },
      function(callback) {
        if (!tripVariable.canceled)
          tripAcceptEventFromDriver(
            clientId,
            trip,
            tripVariable,
            availableDriversArray,
            tripRequestSendArray,
            callback
          );
      },
      function(callback) {
        trip.distance = distance;
        trip.passengerContact = passengerContact;
        trip.passengerName = full_name;
        if (!tripVariable.canceled) {
          websockets.drivers.sockets[clientId].emit(trip.id, {
            tripId: trip.id,
            tripDetail: trip
          });
          callback();
        }
      }
    ]);
  }

  // /**
  //  * send trip event to all drivers that trip event you have received is already being accepted
  //  */
  // function hideTripReqEventEmitToDriver(
  //   data,
  //   tripRequestSendArray,
  //   acceptByClientId,
  //   tripId
  // ) {
  //   tripRequestSendArray.forEach(sendedTripRequest => {
  //     if (acceptByClientId != sendedTripRequest.socket)
  //       websockets.drivers.sockets[tripRequestSendArray.socket].emit(
  //         "cancel_" + tripId,
  //         {
  //           tripId: trip.id,
  //           message: "Trip already accepted by another driver"
  //         }
  //       );
  //   });
  // }

  /**
   * tripAcceptEventFromDriver
   */
  function tripAcceptEventFromDriver(
    clientId,
    trip,
    tripVariable,
    availableDriversArray,
    tripRequestSendArray,
    callback
  ) {
    // update trip accept event name because it emit and listen on client
    websockets.drivers.sockets[clientId].on(
      "abd_" + trip.id,
      function tripAcceptReqFromDriver(data) {
        if (!tripVariable.accepted && !tripVariable.canceled) {
          console.log("inside accespt by driver");
          tripVariable.accepted = true;
          if (
            data.tripId &&
            data.driverId &&
            data.tripId == trip.id &&
            !tripVariable.canceled
          ) {
            async.waterfall([
              function(callback) {
                // remove accept ride by driver listener and
                // send an event to all drivers that ride with specific id accepted
                removeABDListener(
                  clientId,
                  tripAcceptReqFromDriver,
                  data.tripId,
                  tripVariable,
                  callback
                );
              },
              function(callback) {
                cancelRideByDriverEvent(trip, tripVariable, clientId, callback);
              },
              function(callback) {
                //update trip detail and carry on tracking process.
                updateTripDetailAndStartTracking(
                  data,
                  clientId,
                  trip,
                  tripVariable,
                  availableDriversArray,
                  callback
                );
              }
            ]);
          } else
            emitErrorToDriver(
              clientId,
              "incomplete data send to server, some fields are missing while accepting trip request or tripId is wrong."
            );
        }
      }
    );
    callback();
  }

  /**
   *  remove accept ride by driver listener and 
      send an event to all drivers that ride with specific id accepted
   */
  function removeABDListener(
    clientId,
    tripAcceptReqFromDriver,
    tripId,
    tripVariable,
    callback
  ) {
    websockets.drivers.clients((error, clients) => {
      if (error) next(error);
      else if (!tripVariable.canceled) {
        websockets.drivers.sockets[clientId].removeListener(
          "abd_" + tripId,
          tripAcceptReqFromDriver
        );

        clients.forEach(socketId => {
          //send message to other drivers that ride accepted
          if (socketId != clientId) {
            websockets.drivers.sockets[socketId].emit(
              "rideAllReadyAccepted_" + tripId,
              {
                message: `Ride with id ${tripId} already accepted by other driver.`
              }
            );
          }
        });
        callback();
      } else callback();
    });
  }

  /**
   * updateTripDetailAndStartTracking
   */
  function updateTripDetailAndStartTracking(
    data,
    clientId,
    trip,
    tripVariable,
    availableDriversArray,
    callback
  ) {
    // tripVariable.accepted = true;
    availableDriversArray = [];
    Tripdetail.findById(data.tripId, function(errorTripDetail, dataTripDetail) {
      if (errorTripDetail || !dataTripDetail)
        emitErrorToDriver(
          clientId,
          "there is some error at server while accessing trip detail with id " +
            data.tripId +
            "."
        );
      else if (dataTripDetail && !tripVariable.canceled) {
        dataTripDetail.__data.tripStatus = "assigned";
        dataTripDetail.__data.driverId = data.driverId;

        Tripdetail.upsert(dataTripDetail.__data, function(
          errorWhileTripDetailUpserting,
          upsertDataTripDetail
        ) {
          if (errorWhileTripDetailUpserting)
            emitErrorToDriver(clientId, errorWhileTripDetailUpserting);
          else {
            console.log("sending tripAccept event to passenger");
            sendTripAcceptEventToPassenger(data, clientId, trip, tripVariable);
            //know trip detail updated know start event from passenger and get it to drver
          }
        });
      }
      callback();
    });
  }

  /**
   * sendTripAcceptEventToPassenger()
   */
  function sendTripAcceptEventToPassenger(data, clientId, trip, tripVariable) {
    connectedPassengers.forEach(allPass => {
      if (allPass.passengerId == trip.passengerId && !tripVariable.canceled) {
        Tripdetail.app.models.driver.findById(data.driverId, function(
          err,
          driverInfo
        ) {
          if (err) console.log(err);
          else if (!driverInfo) console.log("no data available of driver");
          else {
            Tripdetail.app.models.vehicle.findOne(
              {
                driverId: data.driverId
              },
              function(errorInVehicles, vehicle) {
                if (errorInVehicles) console.error(errorInVehicles);
                else {
                  driverInfo.__data.vehicle = vehicle.__data;
                  console.log("sending accept event to passenger");

                  allPass.socket.emit("accepted_" + data.tripId, {
                    tripId: data.tripId,
                    driver: driverInfo.__data
                  });
                  driverArrivedAtPassengerLoc(
                    allPass.socket,
                    clientId,
                    data.tripId
                  );
                  realTimeTracking(
                    allPass.socket,
                    clientId,
                    data.tripId,
                    tripVariable
                  );
                  rideStart(allPass.socket, clientId, data.tripId);
                }
              }
            );
          }
        });
      }
    });
    // websockets.passengers.emit("accepted_" + data.tripId, {
    //   tripId: data.tripId,
    //   driver: driverInfo.__data
    // });

    //start tracking from here
  }
  //update trip and driver...
  //emit event to all other drivers who already received trip request...

  //----------------------------------------------------------------------------------------

  /**
   * ride starts events
   * @param {*} passSocket
   * @param {*} driverClientId
   * @param {*} tripId
   * @param {*} driverId
   */
  function rideStart(passSocket, clientId, tripId) {
    websockets.drivers.sockets[clientId].on(
      "rideStart_" + tripId,
      function rideStart(data) {
        Tripdetail.findById(tripId, function(error, trip) {
          if (error) throw error;
          else {
            trip.__data.tripStatus = "on_ride";
            Tripdetail.upsert(trip.__data, function(err) {
              if (err) throw err;
              else {
                rideEnd(passSocket, clientId, tripId);
                driverSendAmount(passSocket, clientId, tripId);
                cashAmountEvent(passSocket, clientId, tripId);
                websockets.drivers.sockets[clientId].removeListener(
                  "rideStart_" + tripId,
                  rideStart
                );
                passSocket.emit("rideStarted_" + tripId, {
                  message: `Ride with id ${tripId} begins.`
                });
              }
            });
          }
        });
      }
    );
  }

  /**
   * ride ends events
   * @param {*} passSocket
   * @param {*} driverClientId
   * @param {*} tripId
   * @param {*} driverId
   */

  function rideEnd(passSocket, clientId, tripId) {
    // websockets.drivers.sockets[clientId].removeListener('')
    websockets.drivers.sockets[clientId].on(
      "rideEnd_" + tripId,
      function rideEnd(data) {
        Tripdetail.findById(tripId, function(error, trip) {
          if (error) throw error;
          else {
            trip.__data.tripStatus = "ride_end";
            Tripdetail.upsert(trip.__data, function(err) {
              if (err) throw err;
              else {
                websockets.drivers.sockets[clientId].removeListener(
                  "rideEnd_" + tripId,
                  rideEnd
                );
                passSocket.emit("rideEnded_" + tripId, {
                  message: `Ride with id ${tripId} ends.`
                });
              }
            });
          }
        });
      }
    );
  }

  /**
   * driver send amount to passenger events
   * @param {*} passSocket
   * @param {*} driverClientId
   * @param {*} tripId
   * @param {*} driverId
   */
  function driverSendAmount(passSocket, clientId, tripId) {
    websockets.drivers.sockets[clientId].on(
      "tripAmountFromDriver_" + tripId,
      function tripAmountFromDriver(data) {
        if (data.amount) {
          Tripdetail.findById(tripId, function(error, trip) {
            if (error) throw error;
            else {
              trip.__data.amount = data.amount;
              Tripdetail.upsert(trip.__data, function(err) {
                if (err) throw err;
                else {
                  websockets.drivers.sockets[clientId].removeListener(
                    "tripAmountFromDriver_" + tripId,
                    tripAmountFromDriver
                  );
                  passSocket.emit("tripAmount_" + tripId, {
                    amount: data.amount
                  });
                }
              });
            }
          });
        }
      }
    );
  }

  /**
   * ride ends events
   * @param {*} passSocket
   * @param {*} driverClientId
   * @param {*} tripId
   * @param {*} driverId
   */
  function cashAmountEvent(passSocket, clientId, tripId) {
    websockets.drivers.sockets[clientId].on(
      "cashPaymentRec_" + tripId,
      function cashPayment(data) {
        Tripdetail.findById(tripId, function(error, trip) {
          if (error) throw error;
          else {
            trip.__data.paymentType = "cash";
            Tripdetail.upsert(trip.__data, function(err) {
              if (err) throw err;
              else {
                websockets.drivers.sockets[clientId].removeListener(
                  "cashPaymentRec_" + tripId,
                  cashPayment
                );
                passSocket.emit("cashPayment_" + tripId, {
                  message: `passenger pay amount through cash of tripId ${tripId}`
                });
              }
            });
          }
        });
      }
    );
  }

  /**
   * driver Arrived At Passenger Location events
   * @param {*} passSocket
   * @param {*} driverClientId
   * @param {*} tripId
   */
  function driverArrivedAtPassengerLoc(passSocket, clientId, tripId) {
    websockets.drivers.sockets[clientId].on(
      "arrivedPassLoc_" + tripId,
      function driverArrivedPassLocation(data) {
        websockets.drivers.sockets[clientId].removeListener(
          "arrivedPassLoc_" + tripId,
          driverArrivedPassLocation
        );
        passSocket.emit("driverIsAtPassLoc" + tripId, {
          message: "Driver is arrived at your location & waiting for you!"
        });
      }
    );
  }

  /**
   * realtime tracking events
   * @param {*} passSocket
   * @param {*} driverClientId
   * @param {*} tripId
   * @param {*} tripVariable => object contains accepted and canceled value
   */
  function realTimeTracking(passSocket, clientId, tripId, tripVariable) {
    //listen event from driver
    websockets.drivers.sockets[clientId].emit("beginTracking", {});
    websockets.drivers.sockets[clientId].on(
      "onLocChange_" + tripId,
      function realTimeTrackingEvent(data) {
        if (data.lat && data.lng && !tripVariable.canceled) {
          passSocket.emit("locChange_" + tripId, {
            lat: data.lat,
            lng: data.lng
          });
        }
      }
    );
  }

  /**
   * cancelSendedTripRequest
   * upto 50 KM if no driver accepts trip request or no driver found within range
   * cancel trip requests if any sended after emit an event to passenger noDriverFound_tripId
   */
  // function cancelSendedTripRequest() {
  //   tripRequestSendArray.forEach(driver => {
  //     driver.socket.emit("tripCancel_" + tripRequestSendArray.trip.id);
  //   });
  // }

  /**
   * throw error event to driver
   */
  function emitErrorToDriver(clientId, message) {
    websockets.drivers.sockets[clientId].emit("errorInSocket", {
      statusCode: 400,
      message: message,
      status: "failure"
    });
  }

  /**
   * throw an error to passenger that no driver found
   */
  function noDriverAvailable(passengerId) {
    connectedPassengers.forEach(allPass => {
      if (allPass.passengerId == passengerId)
        allPass.socket.emit("noDriverFound", {
          statusCode: 400,
          message: "no driver available",
          status: "failure"
        });
    });
  }

  /**
   * sendTripIdToDriver emit event
   */
  function sendTripIdToDriver(clientId, tripId) {
    async.waterfall([
      function(callback) {
        websockets.drivers.sockets[clientId].emit("sendTripIdToDriver", {
          tripId: tripId
        });
        callback();
      },
      function(callback) {
        getLocationFromDriver(clientId, callback);
      }
    ]);
  }

  /**
   * ask to driver for his location event, emit event
   */
  function getLocationFromDriver(clientId, callback) {
    websockets.drivers.sockets[clientId].emit("sendLocationToServer", {
      message: "send your location to server"
    });
    callback();
  }
};
