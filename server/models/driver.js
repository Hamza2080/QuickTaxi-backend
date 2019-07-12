"use strict";

let websockets = require("../server.js");
let low = 1000;
let high = 9999;
const accountSid = "AC0ebde588c403af5e8140237a3b881a37";
const authToken = "856d17598443a1147c1a079a253ad1f2";
const client = require("twilio")(accountSid, authToken);

module.exports = function(Driver) {
  Driver.disableRemoteMethodByName("logout", false);

  Driver.afterRemote("findById", function(ctx, model, next) {
    if (model.__data) {
      let rating =
        5 * model.__data.rating["5"] +
        4 * model.__data.rating["4"] +
        3 * model.__data.rating["3"] +
        2 * model.__data.rating["2"] +
        1 * model.__data.rating["1"];
      rating /=
        model.__data.rating["5"] +
        model.__data.rating["4"] +
        model.__data.rating["3"] +
        model.__data.rating["2"] +
        model.__data.rating["1"];
      model.__data.rating = rating;
      Driver.app.models.vehicle.find(model.__data.vehicleId, function(
        error,
        data
      ) {
        if (error) next(error);
        else if (data.length > 0) {
          model.__data.vehicle = data[0].__data;
          next();
        } else next();
      });
      // next();
    } else next();
  });

  /**
   * model remote hook on create method
   * insert otp_code and otp_code_date_time to the data inserted object
   */
  Driver.beforeRemote("create", function(ctx, modelInstance, next) {
    Driver.find({where : {email: ctx.args.data.email}},
      function(err, data) {
        if (err)
          next({
            status: "Failure",
            statusCode: 500,
            message:
              "internal sever error, data object not found inside context onject in before remote hook on create driver",
            data: {}
          });
        else if (data.length > 0) next()
        else {
          let date = new Date();
          date.setUTCHours(date.getUTCHours() + 1);
          if (ctx.args.data.phone) {
            let otp = Math.floor(Math.random() * (high - low) + low);
            client.messages
              .create({
                body: "Your QuickTaxi application OTP code is : " + otp,
                from: "+12016907705",
                to: ctx.args.data.phone
              })
              .then(message => {
                ctx.args.data.otp_code = otp;
                ctx.args.data.otp_code_date_time = date;
                next();
              })
              .catch(error => {
                next(error);
              });
          }
        }




        // if (err.statusCode != 401) {
          // let date = new Date();
          // date.setUTCHours(date.getUTCHours() + 1);
          // if (ctx.args.data.phone) {
          //   let otp = Math.floor(Math.random() * (high - low) + low);
          //   client.messages
          //     .create({
          //       body: "Your QuickTaxi application OTP code is : " + otp,
          //       from: "+12016907705",
          //       to: ctx.args.data.phone
          //     })
          //     .then(message => {
          //       ctx.args.data.otp_code = otp;
          //       ctx.args.data.otp_code_date_time = date;
          //       next();
          //     })
          //     .catch(error => {
          //       next(error);
          //     });
        //   } else
        //     next({
        //       status: "Failure",
        //       statusCode: 500,
        //       message:
        //         "internal sever error, data object not found inside context onject in before remote hook on create driver",
        //       data: {}
        //     });
        // } else next();
      }
    );
  });

  /**
   * model remote hook on login method
   * update response of login method and insert fields in it
   */
  Driver.afterRemote("login", function(ctx, modelInstance, next) {
    if (modelInstance.__data) {
      Driver.findById(modelInstance.__data.userId, function(err, driver) {
        if (err) next(err);
        else if (driver) {
          ctx.result.driver_status = driver.__data.driver_status;
          ctx.result.registration_step = driver.__data.registration_step;
          ctx.result.verified = driver.__data.verified;
          ctx.result.full_name = driver.__data.full_name;
          next();
        }
      });
    } else next();
  });

  /**
   * model remote hook on logout
   */
  // Driver.afterRemote("logout", function (ctx, modelInstance, next) {
  //     ctx.result = {
  //         statusCode: 200,
  //         status: "success"
  //     }
  //     next();
  // });

    /**
   * rate driver
   */
  Driver.rateDriver = function(driverId, rating, cb) {
    if (rating == 1 || rating == 2 || rating == 3 || rating == 4 || rating == 5) {
      Driver.findById (driver, function (err, driver) {
        if (err) cb (err)
        else if (driver) {
          driver.__data.rating[rating] += 1;
          Driver.upsert(driver, function(error, data1) {
            if (error) cb (error)
            else {
              cb (null, {
                status: "Failure",
                statusCode: 400,
                message: `you have assigned ${rating} star rating to driver.`,
                data: {}
              })
            }
          })
        }
        else 
        cb ({
          status: "Failure",
          statusCode: 400,
          message: `driver with id ${driverId} not found`,
          data: {}
        })
      })
    } else cb ({
      status: "Failure",
      statusCode: 400,
      message: `insert a valid rating with in a range of 1-5`,
      data: {}
    })
  };

  Driver.remoteMethod("rateDriver", {
    accepts: [{
      arg: "driverId",
      type: "string",
      required: true
    },{
      arg: "rating",
      type: "number",
      required: true
    }],
    returns: {
      arg: "driver",
      type: "object"
    }
  });

  /**
   * logout driver
   */
  Driver.logoutDriver = function(driverId, cb) {
    Driver.app.models.AccessToken.destroyAll(
      {
        userId: driverId
      },
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

  Driver.remoteMethod("logoutDriver", {
    accepts: {
      arg: "driverId",
      type: "string",
      required: true
    },
    returns: {
      arg: "driver",
      type: "object"
    }
  });

  /**
   * method which accepts otp_code and userId
   * and veirifed user object against otp_code
   */
  Driver.verifyOtp = function(driverId, data, cb) {
    if (driverId && data.otp_code && data.email && data.password) {
      Driver.findById(driverId, function(err, driver) {
        if (err) cb(err);
        else if (driver) {
          let day = new Date().getUTCDay();
          let OtpDay = new Date(driver.__data.otp_code_date_time).getUTCDay();
          if (!driver.__data.verified && day > OtpDay - 1) {
            if (driver.__data.otp_code == data.otp_code) {
              driver.__data.verified = true;
              driver.__data.emailVerified = true;
              Driver.upsert(driver, function(error, data1) {
                if (error) cb(error);
                else {
                  Driver.login(
                    {
                      email: data.email,
                      password: data.password
                    },
                    function(err2, success) {
                      if (err2) cb(err2);
                      else cb(null, success);
                    }
                  );
                }
              });
            } else
              cb({
                status: "Failure",
                statusCode: 400,
                message: "OTP code is wrong",
                data: {}
              });
          } else if (!driver.__data.verified && day <= OtpDay - 1)
            cb({
              status: "Failure",
              statusCode: 400,
              message:
                "OTP code is expired please regenerate Otp code and verify it with in one day.",
              data: {}
            });
          else {
            if (driver.__data.otp_code == data.otp_code) {
              Driver.login(
                {
                  email: data.email,
                  password: data.password
                },
                function(err2, success) {
                  if (err2) cb(err2);
                  else cb(null, success);
                }
              );
            } else {
              cb({
                status: "Failure",
                statusCode: 400,
                message: "OTP code is wrong.",
                data: {}
              });
            }
          }
        } else
          cb({
            status: "Failure",
            statusCode: 400,
            message: "Driver Id " + driverId + " not found",
            data: {}
          });
      });
    } else
      cb({
        status: "Failure",
        statusCode: 400,
        message: "otp_code email, password are required ",
        data: {}
      });
  };

  Driver.remoteMethod("verifyOtp", {
    accepts: [
      {
        arg: "driverId",
        type: "string",
        required: true
      },
      {
        arg: "data",
        type: "object",
        required: true
      }
    ],
    http: {
      path: "/verifyOtp/:driverId",
      verb: "post"
    },
    returns: {
      arg: "driver",
      type: "object"
    }
  });

  /**
   * method accepts driverId and resend OTP_code to phone from db
   */
  Driver.reSendOTP = function(driverId, cb) {
    Driver.findById(driverId, function(err, driver) {
      if (err) cb(err);
      else if (driver) {
        if (driver.__data.id && driver.__data.phone) {
          let date = new Date();
          date.setUTCHours(date.getUTCHours() + 1);
          let otp = Math.floor(Math.random() * (high - low) + low);
          client.messages
            .create({
              body: "Your QuickTaxi application OTP code is : " + otp,
              from: "+12016907705",
              to: driver.__data.phone
            })
            .then(message => {
              driver.__data.otp_code = otp;
              driver.__data.otp_code_date_time = date;
              Driver.upsert(driver, function(error, data1) {
                if (error) cb(error);
                else
                  cb(null, {
                    status: "success",
                    statusCode: 200,
                    message: "otp code updated and resend to phone ",
                    data: {}
                  });
              });
            })
            .catch(error => {
              cb(error);
            });
        } else
          cb({
            status: "Failure",
            statusCode: 400,
            message:
              "No driver found of id " +
              driverId +
              " or driver do not have a valid phone number",
            data: {}
          });
      } else
        cb({
          status: "Failure",
          statusCode: 400,
          message:
            "No driver found of id " +
            driverId +
            " or driver do not have a valid phone number",
          data: {}
        });
    });
  };

  Driver.remoteMethod("reSendOTP", {
    accepts: {
      arg: "driverId",
      type: "string",
      required: true
    },
    returns: {
      arg: "driver",
      type: "object"
    }
  });

  /**
   * get all trips assigned to driver by Id
   */
  Driver.getAllTrips = function(driverId, cb) {
    Driver.app.models.tripDetail.find({where :{ driverId: driverId }}, function( error, data  ) {
      if (error) cb(error);
      else {
        let trips = [];
        if (data.length > 0) {
          data.forEach((elem, i) => {
            Driver.findById(
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
                  Driver.app.models.vehicle.find(
                    { where: { driverId: driver_data.__data.id } },
                    function(err, vehicle_data) {
                      if (err) cb(err);
                      else if (vehicle_data) {
                        elem.__data["plateNumber"] = vehicle_data[0].plateNumber;
                        elem.__data["noOfSeats"] = vehicle_data[0].noOfSeats;
                        let vehicleCompanyId = vehicle_data[0].vehicleTypeId? vehicle_data[0].vehicleTypeId : vehicle_data[0].vehicleCompanyId

                        Driver.app.models.vehicleCompany.findById(vehicleCompanyId, function(err, vehicle_company) {
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
    });
  };
  Driver.remoteMethod("getAllTrips", {
    accepts: {
      arg: "driverId",
      type: "string",
      required: true
    },
    http: { verb: "get", path: "/:driverId/getAllTrips" },
    returns: {
      arg: "trips",
      type: "array"
    }
  });


    /**
   * get all rides that are in progress
   */
  Driver.ridesInProgress = function(driverId, cb) {
    Driver.app.models.tripDetail.find(
      {
        where: {
          and: [
            { tripStatus: { neq: "ride_end" } },
            { tripStatus: { neq: "pending" } },
            { driverId: driverId }
          ]
        }
      },
      function(error, data) {
        if (error) cb(error);
        else if (data){
          let trips = [];
          if (data.length > 0) {
            data.forEach((elem, i) => {
              Driver.findById(
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
                    Driver.app.models.vehicle.find(
                      { where: { driverId: driver_data.__data.id } },
                      function(err, vehicle_data) {
                        if (err) cb(err);
                        else if (vehicle_data) {
                          elem.__data["plateNumber"] = vehicle_data[0].plateNumber;
                          elem.__data["noOfSeats"] = vehicle_data[0].noOfSeats;
                          let vehicleCompanyId = vehicle_data[0].vehicleTypeId? vehicle_data[0].vehicleTypeId : vehicle_data[0].vehicleCompanyId
                          Driver.app.models.vehicleCompany.findById(vehicleCompanyId, function(err, vehicle_company) {
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
  Driver.remoteMethod("ridesInProgress", {
    accepts: [
      {
        arg: "driverId",
        type: "string",
        required: true
      }
    ],
    http: { verb: "get", path: "/:driverId/ridesInProgress" },
    returns: {
      arg: "trips",
      type: "array"
    }
  });
};
