'use strict';

module.exports = function(Vehicle) {

    Vehicle.observe('loaded', function (ctx, next) {
        if (ctx.data && !ctx.isNewInstance) {
            let vehicle = ctx.data;
            if (ctx.data.vehicleCompanyId)
            Vehicle.app.models.vehicleCompany.findById (ctx.data.vehicleCompanyId, function(err, data){
                if (err) next(err)
                else if (data){
                    ctx.data.vehicleCompanyName = data.__data.vehicleCompany;
                    if (ctx.data.modelId!=0)
                    ctx.data.model = data.__data.model[ctx.data.modelId-1].modelName;
                    ctx.data.noOfSeats = data.__data.model[ctx.data.modelId-1].noOfSeats;
                    next();
                } else next();
            })
            else next();
        } else next();
      });
};
