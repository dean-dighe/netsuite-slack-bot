/*******************************************************************************
 * The following javascript code is created internally
 *
 * Script Name :        [THB] NetSuite Slack Bot
 * Notes :              Slack NS Paper Bot - Connect NetSuite to Slack
 * Author  :            Dean Dighe - dean@lasecaintegrations.com
 *
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * ******************************************************************************/
define(['N/record', 'N/log', 'N/search', 'N/runtime', 'N/https'], function(record, log, search, runtime, https) {
    function afterSubmit(context) {
        const Record = record.load({
            type: context.newRecord.type,
            id: context.newRecord.id
        });
        log.audit('Record Type: ' + context.newRecord.type);
        const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };

        let custRecordId = Record.getValue({fieldId: 'rectype'});
        let tranType = Record.getValue({fieldId: 'baserecordtype'});
        let tranLinkType = Record.getValue({fieldId: 'type'});
        // Obtain an object that represents the current script
        let myScript = runtime.getCurrentScript();
        //
        // Obtain values from the script parameter
        //
        const accountId = runtime.accountId;
        let errorName = myScript.getParameter({
            name: 'custscript_errorname'
        });
        let slackWebhook = myScript.getParameter({
            name: 'custscript_slackwebhook'
        });
        let errorImageOnMessage = myScript.getParameter({
            name: 'custscript_errorimage'
        });
        let errorDescription = myScript.getParameter({
            name: 'custscript_description'
        });
        //Load list of fields to add. They have to be comma separated so we may parse them
        let fieldsToAdd = myScript.getParameter({
            name: 'custscript_fieldsadd'
        });
        let fieldsToAddArray = '';
        if (fieldsToAdd != null && fieldsToAdd != "") {
            fieldsToAddArray = fieldsToAdd.split(',');
        }
        let blocksToAdd = [];
        //Report Header
        let reportTitleText;
        if (errorDescription != null && errorDescription != "") {
            reportTitleText = "\n>Title: _" + errorName + "_ \n" + '>_' + errorDescription + '_';
        } else {
            reportTitleText = "\n>Title: _" + errorName + "_";
        }
        let reportTitle = {
            "type": "section",
            "text": {
            "type": "mrkdwn",
                "text": reportTitleText
            }
        }
        blocksToAdd.push(reportTitle);
        let dateBlock;
        if (((context.newRecord.type).startsWith('customrecord')) == true) {
            let tranId = Record.getValue({fieldId: 'name'});
            let dateCreated = Record.getValue({fieldId: 'created'});
            dateBlock = {
                "type": "section",
                "block_id": "section1",
                "text": {
                    "type": "mrkdwn",
                    "text": "*Tran#* `" + tranId + "`\n*Type:* `" + tranType + "`\n*Date Created:* `" + dateCreated + "`"
                },
                "accessory": {
                    "type": "image",
                    "image_url": errorImageOnMessage ?? "http://s3.amazonaws.com/pix.iemoji.com/images/emoji/apple/ios-12/256/double-exclamation-mark.png",
                    "alt_text": "errorImageonMessage"
                }
            }
        } else {
            let date = (Record.getValue({fieldId: 'trandate'})).toLocaleDateString('en-us', options);
            let dateCreated = (Record.getValue({fieldId: 'createddate'})).toLocaleDateString('en-us', options);
            let tranId = Record.getValue({fieldId: 'tranid'});
            dateBlock = {
                "type": "section",
                "block_id": "section1",
                "text": {
                    "type": "mrkdwn",
                    "text": "*Tran#* `" + tranId + "`\n*Type:* `" + tranType + "`\n*Date Created:* `" + dateCreated + "`\n*Tran Date:* `" + date + "`"
                },
                "accessory": {
                    "type": "image",
                    "image_url": errorImageOnMessage ?? "http://s3.amazonaws.com/pix.iemoji.com/images/emoji/apple/ios-12/256/double-exclamation-mark.png",
                    "alt_text": "errorImageonMessage"
                }
            }
        }
        blocksToAdd.push(dateBlock);
        let linkToTransaction;
        if (((context.newRecord.type).startsWith('customrecord')) == true) {
            linkToTransaction = {
                "type": "section",
                "block_id": "section2",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": "*Link to Transaction:*\n https://" + accountId + ".app.netsuite.com/app/common/custom/custrecordentry.nl?rectype=" + custRecordId + "&id=" + context.newRecord.id
                    }
                ]
            }
        } else { //native transactions
            linkToTransaction = {
                "type": "section",
                "block_id": "section2",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": "*Link to Transaction:*\n https://" + accountId + ".app.netsuite.com/app/accounting/transactions/" + tranLinkType + ".nl?id=" + context.newRecord.id + "&whence="
                    }
                ]
            }
        }
        blocksToAdd.push(linkToTransaction);
        if (fieldsToAddArray != null && fieldsToAddArray != "") {
            for (let i = 0; i < fieldsToAddArray.length; i++) {
                let fieldData = Record.getText({fieldId: fieldsToAddArray[i]});
                let fieldObj = Record.getField({fieldId: fieldsToAddArray[i]});
                let fieldLabel = fieldObj.label;
                let itemObj = {
                    "type": "section",
                    "block_id": "sectionMain" + i,
                    "text": {
                        "type": "mrkdwn",
                        "text": '*' + fieldLabel + ':* `' + fieldData + '`'
                    }
                }
                blocksToAdd.push(itemObj);
            }
        }
        //Load search from the params to see if the record meets the filter requirements
        let filterSearch = myScript.getParameter({
            name: 'custscript_savedsearch'
        });
        var mySearch = search.load({
            id: filterSearch
        });
        var filters = mySearch.filters; //reference Search.filters object to a new variable
        var filterOne = search.createFilter({ //create new filter
            name: 'internalid',
            operator: search.Operator.ANYOF,
            values: context.newRecord.id
        });
        filters.push(filterOne); //add the filter using .push() method
        var srchRes = mySearch.run().getRange(0,10); //run script

        if (srchRes.length > 0 && srchRes != "" && srchRes != null) {
            try {
                //Construct the header and body to send to the webhook
                var headers = {
                    'Content-Type': 'application/json'
                };
                var payload = JSON.stringify({
                    "blocks": JSON.parse(JSON.stringify(blocksToAdd)),
                });

                log.debug('Payload created', payload);
                if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
                    var serverResponse = https.post({
                        url: slackWebhook,
                        headers: headers,
                        body: payload
                    });
                }
                log.debug('Server Response', serverResponse);
            } catch (e) {
                log.error(errorName, e);
            }
        } //End of making sure if the transaction is in the filter saved search
    }
    return {
        'afterSubmit' : afterSubmit
    }
});
