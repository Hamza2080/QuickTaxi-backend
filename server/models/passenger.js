"use strict";

var https = require("https");

module.exports = function(Passenger) {
  Passenger.disableRemoteMethodByName("logout", false);

  /**
   * model remote hook on login method
   * update response of login method and insert fields in it
   */
  Passenger.afterRemote("login", function(ctx, modelInstance, next) {
    if (modelInstance.__data) {
      Passenger.findById(modelInstance.__data.userId, function(err, passenger) {
        if (err) next(err);
        else if (passenger) {
          ctx.result.full_name = passenger.__data.full_name;
          next();
        }
      });
    } else next();
  });

  /**
   * operation hook on passenger model for restricting user to update email logged in with third party
   */
  Passenger.observe("before save", function(ctx, next) {
    if (!ctx.isNewInstance) {
      if ((ctx.data.email || ctx.data.password) && !ctx.data.id) {
        Passenger.findById(ctx.options.accessToken.__data.userId, function(
          err,
          data
        ) {
          if (err) next(err);
          else if (data) {
            if (data.__data.third_party)
              next({
                status: "Failure",
                statusCode: 400,
                message:
                  "This account is created on based of third party service, you dont have permission to update email or password",
                data: {}
              });
            else next();
          } else next();
        });
      } else if ((ctx.data.email || ctx.data.password) && ctx.data.id) {
        Passenger.findById(ctx.data.id, function(err, data) {
          if (err) next(err);
          else if (data) {
            if (
              data.__data.email == ctx.data.email &&
              data.__data.password == ctx.data.password
            )
              next();
            else if (data.__data.third_party)
              next({
                status: "Failure",
                statusCode: 400,
                message:
                  "This account is created on based of third party service, you dont have permission to update email or password",
                data: {}
              });
            else next();
          } else next();
        });
      } else next();
    } else next();
  });
  /**
   * favourite driver data inserted when driver findById
   */
  Passenger.afterRemote("findById", function(ctx, modelInstance, next) {
    if (modelInstance.__data) {
      if (modelInstance.__data.favourite_driver) {
        if (modelInstance.__data.favourite_driver.length > 0) {
          let drivers = [];
          modelInstance.__data.favourite_driver.forEach((driverId, i) => {
            Passenger.app.models.driver.findById(driverId, function(
              error,
              data
            ) {
              if (error) next(error);
              else if (data) {
                drivers.push(data.__data);

                if (i == modelInstance.__data.favourite_driver.length - 1) {
                  modelInstance.__data.favourite_driver = drivers;
                  next();
                }
              } else if (
                i ==
                modelInstance.__data.favourite_driver.length - 1
              ) {
                next();
              }
            });
          });
        } else next();
      } else next();
    } else next();
  });

  //---------------------------------------------------------------------------------

  /**
   * method accepts tripId and rating and assign that rating to drivers
   */
  Passenger.rateDriver = function(tripId, rating, cb) {
    Passenger.app.models.tripDetail.findById(tripId, function(err, trip) {
      if (err) cb(err);
      else if (trip.__data) {
        let driverId = trip.__data.driverId;
        Passenger.app.models.driver.findById(driverId, function(err, driver) {
          if (err) cb(err);
          else if (driver.__data) {
            driver.__data.rating[rating] += 1;
            Passenger.app.models.Driver.upsert(driver.__data, function(
              err,
              success
            ) {
              if (err) cb(err);
              else {
                cb(null, {
                  status: "success",
                  statusCode: 200,
                  message: "you have successfully assigned rating to driver",
                  data: {}
                });
              }
            });
          } else
            cb({
              status: "Failure",
              statusCode: 400,
              message: "no driver found with tripId " + tripId,
              data: {}
            });
        });
      } else
        cb({
          status: "Failure",
          statusCode: 400,
          message: "Trip of id " + tripId + " not found.",
          data: {}
        });
    });
  };

  Passenger.remoteMethod("rateDriver", {
    accepts: [
      {
        arg: "tripId",
        type: "string",
        required: true
      },
      {
        arg: "rating",
        type: "number",
        required: true
      }
    ],
    returns: {
      arg: "rating",
      type: "object"
    }
  });

  /**
   * if passenger have any trip in action then return that trip to him
   */
  // Passenger.onGoingTrip = function(passengerId, cb) {
  //   Passenger.app.models.tripDetail.find(
  //     { where: { passengerId: passengerId } },
  //     function(error, data) {
  //       if (error) cb(error);
  //       else {
  //         let trips = [];
  //         if (data.length > 0)
  //           data.forEach((elem, i) => {
  //             if (elem.__data.tripStatus == "on_ride") trips.push(elem.__data);
  //             if (i == data.length - 1) cb(null, trips);
  //           });
  //         else cb(null, trips);
  //       }
  //     }
  //   );
  // };
  // Passenger.remoteMethod("onGoingTrip", {
  //   accepts: {
  //     arg: "passengerId",
  //     type: "string",
  //     required: true
  //   },
  //   http: { verb: "get", path: "/:passengerId/onGoingTrip" },
  //   returns: {
  //     arg: "trips",
  //     type: "array"
  //   }
  // });

  /**
   * if passenger have any trip that accept by driver then return that trip to him
   */
  Passenger.getTripByStatus = function(passengerId, tripType, cb) {
    if (
      tripType == "assigned" ||
      tripType == "ride_end" ||
      tripType == "on_ride"
    ) {
      Passenger.app.models.tripDetail.find(
        {
          where: {
            and: [{ passengerId: passengerId }, { tripStatus: tripType }]
          }
        },
        function(error, data) {
          if (error) cb(error);
          else {
            // cb (null, data)
            let trips = [];
            if (data.length > 0) {
              data.forEach((elem, i) => {
                Passenger.app.models.driver.findById(
                  elem.__data.driverId,
                  function(err, driver_data) {
                    if (err) cb(err);
                    else if (driver_data.__data) {
                      elem.__data["driverName"] = driver_data.__data.full_name;
                      elem.__data["driverEmail"] = driver_data.__data.email;
                      elem.__data["driverPhone"] = driver_data.__data.phone;
                      elem.__data["profile_img_path"] =
                        driver_data.__data.profile_img_path;
                      let rating =
                        5 * driver_data.__data.rating["5"] +
                        4 * driver_data.__data.rating["4"] +
                        3 * driver_data.__data.rating["3"] +
                        2 * driver_data.__data.rating["2"] +
                        1 * driver_data.__data.rating["1"];

                      rating /=
                        driver_data.__data.rating["5"] +
                        driver_data.__data.rating["4"] +
                        driver_data.__data.rating["3"] +
                        driver_data.__data.rating["2"] +
                        driver_data.__data.rating["1"];
                      elem.__data["rating"] = rating;
                      Passenger.app.models.vehicle.find(
                        { where: { driverId: driver_data.__data.id } },
                        function(err, vehicle_data) {
                          if (err) cb(err);
                          else if (vehicle_data) {
                            elem.__data["plateNumber"] =
                              vehicle_data[0].plateNumber;
                            elem.__data["noOfSeats"] =
                              vehicle_data[0].noOfSeats;
                            let vehicleCompanyId = vehicle_data[0].vehicleTypeId? vehicle_data[0].vehicleTypeId : vehicle_data[0].vehicleCompanyId

                            Passenger.app.models.vehicleCompany.findById(
                              vehicleCompanyId,
                              function(err, vehicle_company) {
                                if (err) cb(err);
                                else if (vehicle_company) {
                                  elem.__data["vehicle_company"] =
                                    vehicle_company.vehicleCompany;
                                  elem.__data["vehicle_model"] =
                                    vehicle_company.model[
                                      vehicle_data[0].modelId
                                    ];

                                  trips.push(elem.__data);

                                  setTimeout(() => {
                                    if (i == data.length - 1){cb(null, trips);}
                                  }, 100);
                                } else {
                                  trips.push(elem.__data);
                                  if (i == data.length - 1) cb(null, trips);
                                }
                              }
                            );
                          } else {
                            trips.push(elem.__data);
                            if (i == data.length - 1) cb(null, trips);
                          }
                        }
                      );
                    } else {
                      trips.push(elem.__data);
                      if (i == data.length - 1) cb(null, trips);
                    }
                  }
                );
              });
            } else cb(null, trips);
          }
        }
      );
    } else
      cb({
        status: "Failure",
        statusCode: 400,
        message:
          "Trip type is not valid only assigned, on_ride & ride_end are accepted",
        data: {}
      });
  };
  Passenger.remoteMethod("getTripByStatus", {
    accepts: [
      {
        arg: "passengerId",
        type: "string",
        required: true
      },
      {
        arg: "tripType",
        type: "string",
        required: true
      }
    ],
    http: { verb: "get", path: "/:passengerId/getTripByStatus" },
    returns: {
      arg: "trips",
      type: "array"
    }
  });

  /**
   * get all rides that are in progress
   */
  Passenger.ridesInProgress = function(passengerId, cb) {
    Passenger.app.models.tripDetail.find(
      {
        where: {
          and: [
            { tripStatus: { neq: "ride_end" } },
            { tripStatus: { neq: "pending" } },
            { passengerId: passengerId }
          ]
        }
      },
      function(error, data) {
        if (error) cb(error);
        else if (data){
          let trips = [];
          if (data.length > 0) {
            data.forEach((elem, i) => {
              Passenger.app.models.driver.findById(
                elem.__data.driverId,
                function(err, driver_data) {
                  if (err) cb(err);
                  else if (driver_data) {
                    elem.__data["driverName"] = driver_data.__data.full_name;
                    elem.__data["driverEmail"] = driver_data.__data.email;
                    elem.__data["driverPhone"] = driver_data.__data.phone;
                    elem.__data["profile_img_path"] =
                      driver_data.__data.profile_img_path;
                    let rating =
                      5 * driver_data.__data.rating["5"] +
                      4 * driver_data.__data.rating["4"] +
                      3 * driver_data.__data.rating["3"] +
                      2 * driver_data.__data.rating["2"] +
                      1 * driver_data.__data.rating["1"];

                    rating /=
                      driver_data.__data.rating["5"] +
                      driver_data.__data.rating["4"] +
                      driver_data.__data.rating["3"] +
                      driver_data.__data.rating["2"] +
                      driver_data.__data.rating["1"];
                    elem.__data["rating"] = rating;
                    Passenger.app.models.vehicle.find(
                      { where: { driverId: driver_data.__data.id } },
                      function(err, vehicle_data) {
                        if (err) cb(err);
                        else if (vehicle_data) {
                          elem.__data["plateNumber"] = vehicle_data[0].plateNumber;
                          elem.__data["noOfSeats"] = vehicle_data[0].noOfSeats;
                          let vehicleCompanyId = vehicle_data[0].vehicleTypeId? vehicle_data[0].vehicleTypeId : vehicle_data[0].vehicleCompanyId
                          Passenger.app.models.vehicleCompany.findById(vehicleCompanyId, function(err, vehicle_company) {
                              if (err) cb(err);
                              else if (vehicle_company) {
                                elem.__data["vehicle_company"] = vehicle_company.vehicleCompany;
                                elem.__data["vehicle_model"] = vehicle_company.model[vehicle_data[0].modelId];
                                trips.push(elem.__data);
                                setTimeout(() => {
                                  if (i == data.length - 1){cb(null, trips);}
                                }, 100);
                              }
                            }
                          );
                        }
                      }
                    );
                  }
                }
              );
            });
          } else cb(null, trips);
        }
      }
    );
  };
  Passenger.remoteMethod("ridesInProgress", {
    accepts: [
      {
        arg: "passengerId",
        type: "string",
        required: true
      }
    ],
    http: { verb: "get", path: "/:passengerId/ridesInProgress" },
    returns: {
      arg: "trips",
      type: "array"
    }
  });

  /**
   * logout passenger
   */
  Passenger.logoutPassenger = function(passengerId, cb) {
    Passenger.app.models.AccessToken.destroyAll(
      { userId: passengerId },
      function(err, data) {
        if (err) cb(err);
        else {
          cb(null, {
            status: "success",
            statusCode: 200,
            no_of_tokens_issued: data.count,
            message: "User accessToken successfully destroyed.",
            data: {}
          });
        }
      }
    );
  };

  Passenger.remoteMethod("logoutPassenger", {
    accepts: {
      arg: "passengerId",
      type: "string",
      required: true
    },
    returns: {
      arg: "passenger",
      type: "object"
    }
  });

  /**
   * remote method add favourite drivers to passenger
   */
  Passenger.fav_driver = function(passengerId, driverId, cb) {
    Passenger.findById(passengerId, function(err, passenger) {
      if (err) cb(err);
      else if (passenger) {
        let alreadyExist = false;
        if (passenger.__data) {
          if (passenger.__data.favourite_driver.length > 0) {
            for (let i = 0; i < passenger.__data.favourite_driver.length; i++) {
              if (passenger.__data.favourite_driver[i] == driverId)
                alreadyExist = true;
              if (i == passenger.favourite_driver.length - 1)
                pushFavDriverToPassenger(passenger, driverId, alreadyExist, cb);
            }
          } else
            pushFavDriverToPassenger(passenger, driverId, alreadyExist, cb);
        }
      } else
        cb({
          status: "failure",
          statusCode: 400,
          message: "Passenger with id " + passengerId + " not found.",
          data: {}
        });
    });
  };

  Passenger.remoteMethod("fav_driver", {
    accepts: [
      {
        arg: "passengerId",
        type: "string",
        required: true
      },
      {
        arg: "driverId",
        type: "string",
        required: true
      }
    ],
    returns: {
      arg: "passenger",
      type: "object"
    }
  });

  function pushFavDriverToPassenger(passenger, driverId, alreadyExist, cb) {
    if (!alreadyExist) {
      Passenger.app.models.driver.findById(driverId, function(error, driver) {
        if (error) cb(error);
        else if (driver) {
          passenger.__data.favourite_driver.push(driverId);
          Passenger.upsert(passenger, function(err1, data) {
            if (err1) cb(err1);
            else
              cb({
                status: "success",
                statusCode: 200,
                message:
                  "Driver with id " +
                  driverId +
                  " successfully add to passenger favourite list",
                data: {}
              });
          });
        } else
          cb({
            status: "failure",
            statusCode: 400,
            message: "Driver with id " + driverId + " not found.",
            data: {}
          });
      });
    } else
      cb({
        status: "failure",
        statusCode: 400,
        message:
          "Driver with id " + driverId + " already in passenger favourite list",
        data: {}
      });
  }

  /**
   * remote method remove favourite drivers to passenger
   */
  Passenger.removeFavouriteDriver = function(passengerId, driverId, cb) {
    Passenger.findById(passengerId, function(err, passenger) {
      if (err) cb(err);
      else if (passenger) {
        let alreadyExist = false;
        if (passenger.__data) {
          if (passenger.__data.favourite_driver.length > 0) {
            for (let i = 0; i < passenger.__data.favourite_driver.length; i++) {
              if (passenger.__data.favourite_driver[i] == driverId) {
                alreadyExist = true;
                passenger.__data.favourite_driver.splice(i, 1);
              }
              if (i == passenger.favourite_driver.length - 1 && alreadyExist) {
                Passenger.upsert(passenger, function(err1, data) {
                  if (err1) cb(err1);
                  else
                    cb(null, {
                      status: "success",
                      statusCode: 200,
                      message:
                        "Driver with id " +
                        driverId +
                        " successfully removed from passenger favourite list",
                      data: {}
                    });
                });
              } else if (
                i == passenger.favourite_driver.length - 1 &&
                !alreadyExist
              )
                cb({
                  status: "failure",
                  statusCode: 400,
                  message:
                    "Driver with id " +
                    driverId +
                    " not in passenger favourite list",
                  data: {}
                });
            }
          } else
            cb({
              status: "failure",
              statusCode: 400,
              message:
                "Driver with id " +
                driverId +
                " not in passenger favourite list",
              data: {}
            });
        }
      } else
        cb({
          status: "failure",
          statusCode: 400,
          message: "Passenger with id " + passengerId + " not found.",
          data: {}
        });
    });
  };

  Passenger.remoteMethod("removeFavouriteDriver", {
    accepts: [
      {
        arg: "passengerId",
        type: "string",
        required: true
      },
      {
        arg: "driverId",
        type: "string",
        required: true
      }
    ],
    returns: {
      arg: "passenger",
      type: "object"
    }
  });

  /**
   * facebook login
   */
  Passenger.fb_login = function(userId, accessToken, cb) {
    var options = {
      host: "graph.facebook.com",
      port: 443,
      path:
        "http://graph.facebook.com/v2.5/me?fields=email,birthday,location,locale,age_range,currency,first_name,last_name,name_format,gender&type=large&access_token=" +
        accessToken,
      method: "GET"
    };
    https.get(options, function(res) {
      res.on("data", function(chunk) {
        chunk = JSON.parse(chunk);
        if (chunk.error && res.statusCode != 200) cb(chunk.error);
        else if (chunk.id == userId) {
          let email = "",
            full_name = "",
            password = "";
          if (chunk.email) email = chunk.email;
          else email = chunk.id + "@facebook.com";
          full_name = chunk.first_name + " " + chunk.last_name;
          password = chunk.id;

          Passenger.login(
            {
              email: email,
              password: password
            },
            function(err, response) {
              if (err) {
                Passenger.create(
                  {
                    email: email,
                    password: password,
                    full_name: full_name,
                    phone: "",
                    invitation_Link: "",
                    profile_img: "",
                    profile_img_ext: "",
                    profile_img_path: "",
                    favourite_driver: [],
                    third_party: false
                  },
                  function(error, response1) {
                    if (error) cb(error);
                    else {
                      if (response1.id) {
                        Passenger.login(
                          {
                            email: email,
                            password: password
                          },
                          function(loginError, loginSuccess) {
                            if (loginError) cb(loginError);
                            else {
                              response1.__data.thirdPartylogin = false;
                              response1.__data.full_name = full_name;
                              cb(null, loginSuccess);
                            }
                          }
                        );
                      }
                    }
                  }
                );
              } else {
                response.__data.thirdPartylogin = true;
                response1.__data.full_name = full_name;
                cb(null, response);
              }
            }
          );
        } else
          cb({
            status: "failure",
            statusCode: 400,
            message: "userId not found",
            data: {}
          });
      });
    });
  };

  Passenger.remoteMethod("fb_login", {
    accepts: [
      {
        arg: "userId",
        type: "string",
        required: true
      },
      {
        arg: "accessToken",
        type: "string",
        required: true
      }
    ],
    returns: {
      type: "object",
      root: true
    }
  });

  /**
   * google login
   */
  Passenger.google_login = function(userId, accessToken, cb) {
    var options = {
      path:
        "https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=" +
        accessToken,
      method: "GET"
    };
    https.get(
      "https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=" +
        accessToken,
      function(res) {
        res.on("data", function(chunk) {
          chunk = JSON.parse(chunk);
          if (chunk.error && res.statusCode != 200)
            cb({
              status: "failure",
              statusCode: 401,
              message: chunk.error.message,
              data: {}
            });
          else if (chunk.id == userId) {
            let email = "",
              full_name = "",
              password = "",
              profile_img_path = "";
            if (chunk.email) email = chunk.email;
            else email = chunk.id + "@google.com";
            if (chunk.name) full_name = chunk.name;
            if (chunk.picture) profile_img_path = chunk.picture;
            password = chunk.id;

            Passenger.login(
              {
                email: email,
                password: password
              },
              function(err, response) {
                if (err) {
                  Passenger.create(
                    {
                      email: email,
                      password: password,
                      full_name: full_name,
                      phone: "",
                      invitation_Link: "",
                      profile_img: "",
                      profile_img_ext: "",
                      profile_img_path: "",
                      favourite_driver: [],
                      third_party: false
                    },
                    function(error, response1) {
                      if (error) cb(error);
                      else {
                        if (response1.id) {
                          Passenger.login(
                            {
                              email: email,
                              password: password
                            },
                            function(loginError, loginSuccess) {
                              if (loginError) cb(loginError);
                              else {
                                response1.__data.thirdPartylogin = true;
                                response1.__data.full_name = full_name;
                                cb(null, loginSuccess);
                              }
                            }
                          );
                        }
                      }
                    }
                  );
                } else {
                  response.__data.thirdPartylogin = true;
                  response1.__data.full_name = full_name;
                  cb(null, response);
                }
              }
            );
          } else
            cb({
              status: "failure",
              statusCode: 400,
              message: "userId not found",
              data: {}
            });
        });
      }
    );
  };
  Passenger.remoteMethod("google_login", {
    accepts: [
      {
        arg: "userId",
        type: "string",
        required: true
      },
      {
        arg: "accessToken",
        type: "string",
        required: true
      }
    ],
    returns: {
      arg: "passenger",
      type: "object",
      root: true
    }
  });
};
