'use strict';
var fs = require('fs');
var async = require('async');

module.exports = function (Passengerimg) {

  /*
  name        : removeImage
  description : remove passenger profile image
  @input      : passengerId = string
  @output     : object
  */
 Passengerimg.remoteMethod('removeImage', {
  accepts: [
    {
      arg: "passengerId",
      type: "string",
      required: true
    }
  ],
  http: {
    "verb": "delete",
    "path": "/:passengerId/removeImage"
  },
  returns: {
    arg: 'passenger',
    type: 'object'
  }
});

Passengerimg.removeImage = function (passengerId, cb) {
  Passengerimg.app.models.passenger.findById(passengerId, function (err, passenger) {
    if (err) cb(err)
    else if (passenger) {
      if (passenger.__data.profile_img_path) {
        let image = passenger.__data.profile_img_path.split("/");
        image = image[image.length-1];
        fs.unlink(`./images/passenger/${image}`,function(err){
          if(err) cb (err)
          else cb (null, {
            status: "Success",
            statusCode: 200,
            message: "passenger profile image removed successfully.",
            data: {}
          })
        });  
      } else 
      cb(null, {
        status: "Success",
        statusCode: 200,
        message: "passenger with id " + passengerId + " have no profile image uploaded.",
        data: {}
      });
    }
    else cb({
      status: "Failure",
      statusCode: 404,
      message: "passenger with id " + passengerId + " not found",
      data: {}
    });
  })
}

  /*
  name        : imageUpload
  description : Upload Image to server
  @input      : req : express request object
              : res : express response object
              : passengerId = string
              : container = string
  @output     : object
  */
  Passengerimg.remoteMethod('imageUpload', {
    accepts: [{
        arg: 'req',
        type: 'object',
        'http': {
          source: 'req'
        }
      },
      {
        arg: 'res',
        type: 'object',
        'http': {
          source: 'res'
        }
      },
      {
        arg: "passengerId",
        type: "string",
        required: true
      },
      {
        arg: "container",
        type: "string",
        default: "passenger",
        required: true
      }
    ],
    http: {
      "verb": "post",
      "path": "/:passengerId/container/:container"
    },
    returns: {
      arg: 'object',
      type: 'object'
    }
  });

  Passengerimg.imageUpload = function (req, res, passengerId, container, cb) {
    if (container == 'passenger') {
      Passengerimg.app.models.passenger.findById(passengerId, function (err, passenger) {
        if (err) cb(err)
        else if (passenger) uploadPassengerProfile(passengerId, passenger.__data, container, req, res, cb);
        else cb({
          status: "Failure",
          statusCode: 404,
          message: "passenger with id " + passengerId + " not found",
          data: {}
        });
      })
    } else {
      cb({
        status: "Failure",
        statusCode: 404,
        message: "please enter a valid contaier name",
        data: {}
      });
    }
  }

  /*
name        : uploadImages
description : upload image to server
@input      : passengerId, passenger, container, req, res, cb
@output     : object
*/
  function uploadPassengerProfile(passengerId, passenger, container, req, res, cb) {
    Passengerimg.upload(req, res, function (err, response) {
      if (err) cb({
        status: "Failure",
        statusCode: 502,
        message: "image not uploaded to server please try again",
        data: {}
      })
      else {
        var file = response.files.image[0].name;
        var inputPath = './images/' + container + '/' + file;
        var ImagePath = './images/passenger/' + passengerId + file.substr(file.lastIndexOf('.'), file.length - 1);
        fs.renameSync(inputPath, ImagePath);
        async.waterfall([
          function (callback) {
            saveImageDetail(passengerId, passenger, file, ImagePath, callback);
          }
        ], function (err, result) {
          if (err) cb(err);
          else cb(null, {
            status: "success",
            stausCode: 200,
            message: "Passenger profile successfully saved to server",
            data: result
          })
        });
      }
    })
  }

  /*
  name        : saveImageDetail
  description : update passenger model and add passenger profile image detail in it.
  @input      : passengerId, file
  @output     : object
  */
  function saveImageDetail(passengerId, passenger, file, ImagePath, cb) {
    passenger["profile_img"] = file.substr(0, file.indexOf('.'));
    passenger["profile_img_ext"] = file.substr(file.lastIndexOf('.'), file.length - 1);
    passenger["profile_img_path"] = '/api/passenger_imgs/passenger/download/' + passengerId + file.substr(file.lastIndexOf('.'), file.length - 1);

    Passengerimg.app.models.passenger.upsert(passenger, function (err, response) {
      if (err) cb(err)
      else cb(null, response);
    });
  }

  /*
    name        : disableRemoteMethods
    description : disable all remote methods of passenger_image Model(default remomte methods)
  */
  disableRemoteMethods();

  //disable remote methods...
  function disableRemoteMethods() {
    Passengerimg.disableRemoteMethodByName("getContainers", false);
    Passengerimg.disableRemoteMethodByName("getContainer", false);
    Passengerimg.disableRemoteMethodByName("createContainers", false);
    Passengerimg.disableRemoteMethodByName("destroyContainers", false);
    Passengerimg.disableRemoteMethodByName("getFiles", false);
    Passengerimg.disableRemoteMethodByName("getFile", false);
    Passengerimg.disableRemoteMethodByName("removeFile", false);
    Passengerimg.disableRemoteMethodByName("upload", false);
    // Passengerimg.disableRemoteMethodByName("download", false);
    Passengerimg.disableRemoteMethodByName("uploadStream", false);
    Passengerimg.disableRemoteMethodByName("downloadStream", false);
  };
}