var bignum = require('bignum');
var multiHashing = require('multi-hashing');
var util = require('./util.js');

var diff1 = global.diff1 = 0x00000000ffff0000000000000000000000000000000000000000000000000000;

var algos = module.exports = global.algos =
{
    heavyhash: {
        hash: function () {
            return function () {
                return multiHashing.heavyhash.apply(this, arguments);
            }
        }
    }
};


for (var algo in algos) {
    if (!algos[algo].multiplier)
        algos[algo].multiplier = 1;
}
