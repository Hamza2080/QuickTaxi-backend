module.exports = function (app) {
    var filtered = app.models.User.settings.hidden.filter(function (item) {
        return item !== 'password';
    });
    app.models.User.settings.hidden = filtered
};