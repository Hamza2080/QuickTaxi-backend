module.exports = function (server) {
    var remotes = server.remotes();
    // modify all returned values
    remotes.after('**', function (ctx, next) {
        if (ctx.result) {
            ctx.result.statusCode = 200;
            ctx.result.message = "success";
            next();
        } else next();
    });
};