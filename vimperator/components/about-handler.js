Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;

function AboutHandler() {}

AboutHandler.prototype = {

    classDescription: "About Vimperator Page",

    classID: Components.ID("81495d80-89ee-4c36-a88d-ea7c4e5ac63f"),

    contractID: "@mozilla.org/network/protocol/about;1?what=vimperator",

    QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),

    newChannel: function (uri)
    {
        let channel = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService)
                          .newChannel("chrome://vimperator/content/about.html", null, null);

        channel.originalURI = uri;

        return channel;
    },

    getURIFlags: function (uri) Ci.nsIAboutModule.ALLOW_SCRIPT,
};

function NSGetModule(compMgr, fileSpec) XPCOMUtils.generateModule([AboutHandler]);

// vim: set fdm=marker sw=4 ts=4 et:
