Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function CommandLineHandler()
{
    this.wrappedJSObject = this;
}

CommandLineHandler.prototype = {

    classDescription: "Liberator Command-line Handler",

    classID: Components.ID("{16dc34f7-6d22-4aa4-a67f-2921fb5dcb69}"),

    contractID: "@mozilla.org/commandlinehandler/general-startup;1?type=liberator",

    _xpcom_categories: [{
        category: "command-line-handler",
        entry: "m-liberator"
    }],

    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsICommandLineHandler]),

    handle: function (commandLine)
    {
        // TODO: handle remote launches differently?
        try
        {
            this.optionValue = commandLine.handleFlagWithParam("liberator", false);
        }
        catch (e)
        {
            //"liberator: option -liberator requires an argument"
        }
    }
};

function NSGetModule(compMgr, fileSpec) XPCOMUtils.generateModule([CommandLineHandler]);

// vim: set fdm=marker sw=4 ts=4 et:
