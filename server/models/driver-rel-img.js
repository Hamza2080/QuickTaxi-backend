'use strict';
var fs = require('fs');
var async = require('async');

module.exports = function (Driverimg) {

    /*
    name        : uploadDriverImages
    description : Upload Image to server
    @input      : req : express request object
                : res : express response object
                : driverId = string
                : imageCategory = string
                : imageType = string
                : container = string
    @output     : object
    */

    Driverimg.remoteMethod('uploadDriverImages', {
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
                arg: "driverId",
                type: "string",
                required: true
            },
            {
                arg: "imageCategory",
                type: "string",
                required: true
            },
            {
                arg: "imageType",
                type: "string",
                required: true
            },
            {
                arg: "container",
                type: "string",
                default: "driver",
                required: true
            }
        ],
        http: {
            "verb": "post",
            "path": "/:driverId/category/:imageCategory/type/:imageType/container/:container"
        },
        returns: {
            arg: 'object',
            type: 'object'
        }
    });

    Driverimg.uploadDriverImages = function (req, res, driverId, imageCategory, imageType, container, cb) {
        if ((imageCategory == 'id' || imageCategory == 'carnet' || imageCategory == 'vehicle') &&
            (imageType == 'front' || imageType == 'back') && container == 'driver') {
            Driverimg.app.models.driver.findById(driverId, function (err, driver) {
                if (err) cb(err)
                else if (driver) uploadImage(driverId, driver.__data, imageCategory, imageType, container, req, res, cb);
                else cb({
                    status: "Failure",
                    statusCode: 404,
                    message: "driver with id " + driverId + " not found",
                    data: {}
                });
            })
        } else {
            if (container == 'driver')
                cb({
                    status: "Failure",
                    statusCode: 404,
                    message: "following imageCategories are accepted [id, carnet, vehicle] & imageTypes are [front, back], please enter valid one's",
                    data: {}
                })
            else
                cb({
                    status: "Failure",
                    statusCode: 404,
                    message: "please enter a valid container name",
                    data: {}
                })
        }
    }

    /*
    name        : uploadImage
    description : upload image to server
    @input      : driverId, driver, imageCategory, imageType, container, req, res, cb
    @output     : object
    */

    function uploadImage(driverId, driver, imageCategory, imageType, container, req, res, cb) {
        Driverimg.upload(req, res, function (err, response) {
            if (err) cb({
                status: "Failure",
                statusCode: 502,
                message: "image not uploaded to server please try again",
                data: {}
            })
            else {
                var file = response.files.image[0].name;
                var inputPath = './images/' + container + '/' + file;
                var ImagePath = './images/driver/' + driverId + '_' + imageCategory + '_' + imageType + file.substr(file.lastIndexOf('.'), file.length - 1);
                fs.renameSync(inputPath, ImagePath);
                async.waterfall([
                    function (callback) {
                        saveImageDetail(driverId, driver, imageCategory, imageType, file, ImagePath, callback);
                    }
                ], function (err, result) {
                    if (err) cb(err);
                    else cb(null, {
                        status: "success",
                        stausCode: 200,
                        message: "driver " + imageCategory + " image successfully saved to server",
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
    function saveImageDetail(driverId, driver, imageCategory, imageType, file, ImagePath, cb) {
        if (imageCategory == "vehicle" && imageType == 'front') {
            http: //localhost:3000/api/driver_rel_imgs/driver/download/5c7a3604796a7c2dfdea9eb2_front.png
                driver["car_f_img"] = '/api/driver_rel_imgs/driver/download/' + driverId + '_' + imageCategory + '_' + imageType + file.substr(file.lastIndexOf('.'), file.length - 1);
            Driverimg.app.models.driver.upsert(driver, function (err, response) {
                if (err) cb(err)
                else cb(null, response);
            });
        }
        else if (imageCategory == "vehicle" && imageType == 'back') {
            driver["car_b_img"] = '/api/driver_rel_imgs/driver/download/' + driverId + '_' + imageCategory + '_' + imageType + file.substr(file.lastIndexOf('.'), file.length - 1);
            Driverimg.app.models.driver.upsert(driver, function (err, response) {
                if (err) cb(err)
                else cb(null, response);
            });
        } else if (imageCategory == "id" && imageType == 'front') {
            driver["id_f_img"] = '/api/driver_rel_imgs/driver/download/' + driverId + '_' + imageCategory + '_' + imageType + file.substr(file.lastIndexOf('.'), file.length - 1);
            Driverimg.app.models.driver.upsert(driver, function (err, response) {
                if (err) cb(err)
                else cb(null, response);
            });
        } else if (imageCategory == "id" && imageType == 'back') {
            driver["id_b_img"] = '/api/driver_rel_imgs/driver/download/' + driverId + '_' + imageCategory + '_' + imageType + file.substr(file.lastIndexOf('.'), file.length - 1);
            Driverimg.app.models.driver.upsert(driver, function (err, response) {
                if (err) cb(err)
                else cb(null, response);
            });
        } else if (imageCategory == "carnet" && imageType == 'front') {
            driver["license_f_img"] = '/api/driver_rel_imgs/driver/download/' + driverId + '_' + imageCategory + '_' + imageType + file.substr(file.lastIndexOf('.'), file.length - 1);
            Driverimg.app.models.driver.upsert(driver, function (err, response) {
                if (err) cb(err)
                else cb(null, response);
            });
        } else if (imageCategory == "carnet" && imageType == 'back') {
            driver["license_b_img"] = '/api/driver_rel_imgs/driver/download/' + driverId + '_' + imageCategory + '_' + imageType + file.substr(file.lastIndexOf('.'), file.length - 1);
            Driverimg.app.models.driver.upsert(driver, function (err, response) {
                if (err) cb(err)
                else cb(null, response);
            });
        }
    }
    /*
    name        : disableRemoteMethods
    description : disable all remote methods of passenger_image Model(default remomte methods)
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
    };
};