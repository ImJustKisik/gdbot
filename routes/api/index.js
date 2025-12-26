const express = require('express');

const router = express.Router();

const routeModules = [
    require('./users.routes'),
    require('./settings.routes'),
    require('./monitoring.routes'),
    require('./moderation.routes'),
    require('./invites.routes'),
    require('./stats.routes'),
    require('./logs.routes'),
    require('./embeds.routes'),
    require('./verification.routes'),
    require('./discord.routes')
];

routeModules.forEach((moduleRouter) => {
    router.use(moduleRouter);
});

module.exports = router;
