"use strict";
var fs = require("fs");
var async = require("async");

module.exports = function(Driverimg) {
  /*
  name        : removeImage
  description : remove driver profile image
  @input      : driverId = string
  @output     : object
  */
  Driverimg.remoteMethod("removeImage", {
    accepts: [
      {
        arg: "driverId",
        type: "string",
        required: true
      }
    ],
    http: {
      verb: "delete",
      path: "/:driverId/removeImage"
    },
    returns: {
      arg: "driver",
      type: "object"
    }
  });

  Driverimg.removeImage = function(driverId, cb) {
    Driverimg.app.models.driver.findById(driverId, function( err, driver ) {
      if (err) cb(err);
      else if (driver) {
        if (driver.__data.profile_img_path) {
          let image = driver.__data.profile_img_path.split("/");
          image = image[image.length - 1];
          fs.unlink(`./images/driverProfile/${image}`, function(err) {
            if (err) cb(err);
            else{
              driver.__data.profile_img_path = ""
              Driverimg.app.models.driver.upsert(driver.__data, function (err){
                if (err) cb (err)
                else 
                  cb(null, {
                    status: "Success",
                    statusCode: 200,
                    message: "driver profile image removed successfully.",
                    data: {}
                  });
              })
            }
          });
        } else
          cb(null, {
            status: "Success",
            statusCode: 200,
            message: "driver with id " + driverId + " have no profile image uploaded.",
            data: {}
          });
      } else
        cb({
          status: "Failure",
          statusCode: 404,
          message: "driver with id " + driverId + " not found",
          data: {}
        });
    });
  };

  /*
  name        : imageUpload
  description : Upload Image to server
  @input      : req : express request object
              : res : express response object
              : driverId = string
              : container = string
  @output     : object
  */
  Driverimg.remoteMethod("imageUpload", {
    accepts: [
      {
        arg: "req",
        type: "object",
        http: {
          source: "req"
        }
      },
      {
        arg: "res",
        type: "object",
        http: {
          source: "res"
        }
      },
      {
        arg: "driverId",
        type: "string",
        required: true
      },
      {
        arg: "container",
        type: "string",
        default: "driverProfile",
        required: true
      }
    ],
    http: {
      verb: "post",
      path: "/:driverId/container/:container/imageUpload"
    },
    returns: {
      arg: "object",
      type: "object"
    }
  });

  Driverimg.imageUpload = function(req, res, driverId, container, cb) {
    if (container == "driverProfile") {
      Driverimg.app.models.driver.findById(driverId, function(err, driver) {
        if (err) cb(err);
        else if (driver)
          uploadDriverProfile(driverId, driver.__data, container, req, res, cb);
        else
          cb({
            status: "Failure",
            statusCode: 404,
            message: "driver with id " + driverId + " not found",
            data: {}
          });
      });
    } else {
      cb({
        status: "Failure",
        statusCode: 404,
        message: "please enter a valid contaier name",
        data: {}
      });
    }
  };

/*
  name        : uploadDriverProfile
  description : upload image to server
  @input      : driverId, driver, container, req, res, cb
  @output     : object
*/
  function uploadDriverProfile(driverId, driver, container, req, res, cb) {
    Driverimg.upload(req, res, function(err, response) {
      if (err)
        cb({
          status: "Failure",
          statusCode: 502,
          message: "image not uploaded to server please try again",
          error: err,
          data: {}
        });
      else {
        var file = response.files.image[0].name;
        var inputPath = "./images/" + container + "/" + file;
        var ImagePath = "./images/driverProfile/" +
          driverId +
          file.substr(file.lastIndexOf("."), file.length - 1);
          fs.renameSync(inputPath, ImagePath);
          async.waterfall(
            [
              function(callback) {
                saveImageDetail(driverId, driver, file, ImagePath, callback);
              }
            ],
            function(err, result) {
              if (err) cb(err);
              else
                cb(null, {
                  status: "success",
                  stausCode: 200,
                  message: "driver profile successfully saved to server",
                  data: result
                });
            }
          );
      }
    });
  }

  /*
  name        : saveImageDetail
  description : update driver model and add driver profile image detail in it.
  @input      : driverId, driver, file, ImagePath, cb
  @output     : object
  */
  function saveImageDetail(driverId, driver, file, ImagePath, cb) {
    driver["profile_img"] = file.substr(0, file.indexOf("."));
    driver["profile_img_ext"] = file.substr(
      file.lastIndexOf("."),
      file.length - 1
    );
    driver["profile_img_path"] =
      "/api/driver_imgs/driverProfile/download/" +
      driverId +
      file.substr(file.lastIndexOf("."), file.length - 1);
      
    Driverimg.app.models.driver.upsert(driver, function(err, response) {
      if (err) cb(err);
      else cb(null, response);
    });
  }

  /*
    name        : disableRemoteMethods
    description : disable all remote methods of driver_image Model(default remomte methods)
  */
  disableRemoteMethods();

  //disable remote methods...
  function disableRemoteMethods() {
    Driverimg.disableRemoteMethodByName("getContainers", false);
    Driverimg.disableRemoteMethodByName("getContainer", false);
    Driverimg.disableRemoteMethodByName("createContainers", false);
    Driverimg.disableRemoteMethodByName("destroyContainers", false);
    Driverimg.disableRemoteMethodByName("getFiles", false);
    Driverimg.disableRemoteMethodByName("getFile", false);
    Driverimg.disableRemoteMethodByName("removeFile", false);
    Driverimg.disableRemoteMethodByName("upload", false);
    // Driverimg.disableRemoteMethodByName("download", false);
    Driverimg.disableRemoteMethodByName("uploadStream", false);
    Driverimg.disableRemoteMethodByName("downloadStream", false);
  }
};
