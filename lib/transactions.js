var util = require('./util.js');

var generateOutputTransactions = function (poolRecipient, recipients, rpcData, network, poolOptions) {

    var reward = rpcData.coinbasevalue;
    if (!reward) {
        reward = util.getKotoBlockSubsidy(rpcData.height);
        reward -= rpcData.coinbasetxn.fee; /* rpcData.coinbasetxn.fee := <total fee of transaxtions> * -1)
        /*
        var nScript = parseInt(rpcData.coinbasetxn.data.slice(82, 84), 16);
        if (nScript == 253) {
            nScript = parseInt(util.reverseHex(rpcData.coinbasetxn.data.slice(84, 84 + 4)), 16);
            nScript = nScript + 2;
        } else if (nScript == 254) {
            nScript = parseInt(util.reverseHex(rpcData.coinbasetxn.data.slice(84, 84 + 8)), 16);
            nScript = nScript + 4;
        } else if (nScript == 255) {
            nScript = parseInt(util.reverseHex(rpcData.coinbasetxn.data.slice(84, 84 + 16)), 16);
            nScript = nScript + 8;
        }
        var posReward = 94 + nScript*2;
        reward = parseInt(util.reverseHex(rpcData.coinbasetxn.data.slice(posReward, posReward + 16)), 16);
        //console.log("reward from coinbasetxn.data => " + reward);
        */
        //console.log("reward from coinbasetxn, height => " + reward);
    }

    var rewardToPool = reward;

    var txOutputBuffers = [];


    /* Dash 0.12.1/0.13 */
    if (rpcData.masternode) {
        if (rpcData.masternode.payee) {
            var payeeReward = 0;

            payeeReward = rpcData.masternode.amount;
            reward -= payeeReward;
            rewardToPool -= payeeReward;

            var payeeScript = util.addressToScript({
                address: rpcData.masternode.payee
            });
            txOutputBuffers.push(Buffer.concat([
                util.packInt64LE(payeeReward),
                util.varIntBuffer(payeeScript.length),
                payeeScript
            ]));
        } else if (rpcData.masternode.length > 0) {
            for (var i = 0; i < rpcData.masternode.length; i++) {
                var payeeReward = 0;

                payeeReward = rpcData.masternode[i].amount;
                reward -= payeeReward;
                rewardToPool -= payeeReward;

                var payeeScript;

                if (rpcData.masternode[i].script) {
                    payeeScript = new Buffer(rpcData.masternode[i].script, 'hex');
                } else {
                    payeeScript = util.addressToScript(rpcData.masternode[i].payee);
                }

                txOutputBuffers.push(Buffer.concat([
                    util.packInt64LE(payeeReward),
                    util.varIntBuffer(payeeScript.length),
                    payeeScript
                ]));
            }
        }
    }

    if (rpcData.superblock && rpcData.superblock.length > 0) {
        for (var i = 0; i < rpcData.superblock.length; i++) {
            var payeeReward = 0;

            payeeReward = rpcData.superblock[i].amount;
            reward -= payeeReward;
            rewardToPool -= payeeReward;

            var payeeScript;

            if (rpcData.superblock[i].script) {
                payeeScript = new Buffer(rpcData.superblock[i].script, 'hex');
            } else {
                var payeeScript = util.addressToScript({
                    address: rpcData.superblock[i].payee
                });
            }

            txOutputBuffers.push(Buffer.concat([
                util.packInt64LE(payeeReward),
                util.varIntBuffer(payeeScript.length),
                payeeScript
            ]));
        }
    }
    /* End Dash 0.12.1/0.13 */

    if (rpcData.payee) {
        var payeeReward = 0;

        if (rpcData.payee_amount) {
            payeeReward = rpcData.payee_amount;
        } else {
            payeeReward = Math.ceil(reward / 5);
        }

        reward -= payeeReward;
        rewardToPool -= payeeReward;

        var payeeScript = util.addressToScript({
            address: rpcData.payee
        });
        txOutputBuffers.push(Buffer.concat([
            util.packInt64LE(payeeReward),
            util.varIntBuffer(payeeScript.length),
            payeeScript
        ]));
    }



    for (var i = 0; i < recipients.length; i++) {
        var recipientReward;
        if (recipients[i].percent == 0) {
            if (recipients[i].value < rewardToPool) {
                recipientReward = recipients[i].value;
            } else {
                continue;
            }
        } else {
            recipientReward = Math.floor(recipients[i].percent * reward);
        }
        rewardToPool -= recipientReward;

        txOutputBuffers.push(Buffer.concat([
            util.packInt64LE(recipientReward),
            util.varIntBuffer(recipients[i].script.length),
            recipients[i].script
        ]));
    }


    txOutputBuffers.unshift(Buffer.concat([
        util.packInt64LE(rewardToPool),
        util.varIntBuffer(poolRecipient.length),
        poolRecipient
    ]));

    if (rpcData.default_witness_commitment !== undefined) {
        witness_commitment = new Buffer(rpcData.default_witness_commitment, 'hex');
        txOutputBuffers.unshift(Buffer.concat([
            util.packInt64LE(0),
            util.varIntBuffer(witness_commitment.length),
            witness_commitment
        ]));
    }

    return Buffer.concat([
        util.varIntBuffer(txOutputBuffers.length),
        Buffer.concat(txOutputBuffers)
    ]);

};


exports.CreateGeneration = function (rpcData, publicKey, extraNoncePlaceholder, reward, txMessages, recipients, network, poolOptions) {

    var txInputsCount = 1;
    var txOutputsCount = 1;
    var txVersion = txMessages === true ? 2 : 1;
    var txLockTime = 0;

    var txInPrevOutHash = "";
    var txInPrevOutIndex = Math.pow(2, 32) - 1;
    var txInSequence = 0;

    //Only required for POS coins
    var txTimestamp = new Buffer([]);
    var txComment = new Buffer([]);

    var scriptSigPart1 = Buffer.concat([
        util.serializeNumber(rpcData.height),
        new Buffer([]),
        util.serializeNumber(Date.now() / 1000 | 0),
        new Buffer([extraNoncePlaceholder.length])
    ]);

    var scriptSigPart2 = util.serializeString('/nodeStratum/');

    var p1 = Buffer.concat([
        util.packUInt32LE(txVersion),
        txTimestamp,

        //transaction input
        util.varIntBuffer(txInputsCount),
        util.uint256BufferFromHash(txInPrevOutHash),
        util.packUInt32LE(txInPrevOutIndex),
        util.varIntBuffer(scriptSigPart1.length + extraNoncePlaceholder.length + scriptSigPart2.length),
        scriptSigPart1
    ]);


    /*
    The generation transaction must be split at the extranonce (which located in the transaction input
    scriptSig). Miners send us unique extranonces that we use to join the two parts in attempt to create
    a valid share and/or block.
     */


    var outputTransactions = generateOutputTransactions(publicKey, recipients, rpcData);

    var p2 = Buffer.concat([
        scriptSigPart2,
        util.packUInt32LE(txInSequence),
        //end transaction input

        //transaction output
        outputTransactions,
        //end transaction ouput

        util.packUInt32LE(txLockTime),
        txComment
    ]);

    return [p1, p2];

};
