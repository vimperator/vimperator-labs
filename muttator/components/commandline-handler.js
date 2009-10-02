// Copyright (c) 2009 by Doug Kearns
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.


Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function CommandLineHandler()
{
    this.wrappedJSObject = this;
}

CommandLineHandler.prototype = {

    classDescription: "Muttator Command-line Handler",

    classID: Components.ID("{6e03e01a-3e2c-4a59-ac45-f1b4efb02ddb}"),

    contractID: "@mozilla.org/commandlinehandler/general-startup;1?type=muttator",

    _xpcom_categories: [{
        category: "command-line-handler",
        entry: "m-muttator"
    }],

    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsICommandLineHandler]),

    handle: function (commandLine)
    {
        // TODO: handle remote launches differently?
        try
        {
            this.optionValue = commandLine.handleFlagWithParam("muttator", false);
        }
        catch (e)
        {
            //"muttator: option -muttator requires an argument"
        }
    }
};

function NSGetModule(compMgr, fileSpec) XPCOMUtils.generateModule([CommandLineHandler]);

// vim: set fdm=marker sw=4 ts=4 et:
