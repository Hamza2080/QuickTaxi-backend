'use strict';

module.exports = function (vehicleCompany) {


    vehicleCompany.observe('before save', function filterProperties(ctx, next) {
        if (ctx.instance) {
            ctx.instance.__data.model.forEach((model, i) => {
                ctx.instance.__data.model[i].id = i + 1;

                if (i == ctx.instance.__data.model.length - 1) next();
            });
        } else next();
    });
}