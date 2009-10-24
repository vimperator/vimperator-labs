// Copyright (c) 2008-2009 Kris Maglione <maglione.k at Gmail>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.


/* Adds support for data: URIs with chrome privileges
 * and fragment identifiers.
 *
 * "chrome-data:" <content-type> [; <flag>]* "," [<data>]
 *
 * By Kris Maglione, ideas from Ed Anuff's nsChromeExtensionHandler.
 */

const Ci = Components.interfaces, Cc = Components.classes;

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const NS_BINDING_ABORTED = 0x804b0002;
const nsIProtocolHandler = Components.interfaces.nsIProtocolHandler;

const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

let channel = Components.classesByID["{61ba33c0-3031-11d3-8cd0-0060b0fc14a3}"]
                        .getService(Ci.nsIProtocolHandler)
                        .newChannel(ioService.newURI("chrome://liberator/content/data", null, null))
                        .QueryInterface(Ci.nsIRequest);
const systemPrincipal = channel.owner;
channel.cancel(NS_BINDING_ABORTED);
delete channel;

function makeChannel(url, orig)
{
    let uri = ioService.newURI(url, null, null);
    let channel = ioService.newChannelFromURI(uri);
    channel.owner = systemPrincipal;
    channel.originalURI = orig;
    return channel;
}
function fakeChannel(orig)
    makeChannel("chrome://does/not/exist/in/any/reasonable/configuration", orig);
function redirect(to, orig)
{
    let html = <html><head><meta http-equiv="Refresh" content={"0;" + to}/></head></html>.toXMLString();
    return makeChannel('data:text/html,' + escape(html), orig);
}

function ChromeData() {}
ChromeData.prototype = {
    contractID:       "@mozilla.org/network/protocol;1?name=chrome-data",
    classID:          Components.ID("{c1b67a07-18f7-4e13-b361-2edcc35a5a0d}"),
    classDescription: "Data URIs with chrome privileges",
    QueryInterface:   XPCOMUtils.generateQI([Components.interfaces.nsIProtocolHandler]),
    _xpcom_factory: {
        createInstance: function (outer, iid)
        {
            if (!ChromeData.instance)
                ChromeData.instance = new ChromeData();
            if (outer != null)
                throw Components.results.NS_ERROR_NO_AGGREGATION;
            return ChromeData.instance.QueryInterface(iid);
        }
    },

    scheme: "chrome-data",
    defaultPort: -1,
    allowPort: function (port, scheme) false,
    protocolFlags: nsIProtocolHandler.URI_NORELATIVE
         | nsIProtocolHandler.URI_NOAUTH
         | nsIProtocolHandler.URI_IS_UI_RESOURCE,

    newURI: function (spec, charset, baseURI)
    {
        var uri = Components.classes["@mozilla.org/network/standard-url;1"]
                            .createInstance(Components.interfaces.nsIStandardURL)
                            .QueryInterface(Components.interfaces.nsIURI);
        uri.init(uri.URLTYPE_STANDARD, this.defaultPort, spec, charset, null);
        return uri;
    },

    newChannel: function (uri)
    {
        try
        {
            if (uri.scheme == this.scheme)
                return makeChannel(uri.spec.replace(/^.*?:\/*(.*)(?:#.*)?/, "data:$1"), uri);
        }
        catch (e) {}
        return fakeChannel();
    }
};

function Liberator()
{
    this.wrappedJSObject = this;

    this.__defineGetter__("helpNamespaces", function () NAMESPACES ? NAMESPACES.slice() : null);
    this.__defineSetter__("helpNamespaces", function (namespaces) {
        if (!NAMESPACES)
            NAMESPACES = Array.slice(namespaces)
    });
    this.__defineGetter__("helpFiles", function () HELP_FILES ? HELP_FILES.slice() : null);
    this.__defineSetter__("helpFiles", function (files) {
        if (!HELP_FILES)
            parseHelpTags(files);
    });

    function xpath(doc, expression)
    {
        let result = doc.evaluate(expression, doc,
            function lookupNamespaceURI(prefix) ({
                    xhtml: "http://www.w3.org/1999/xhtml",
                    liberator: "http://vimperator.org/namespaces/liberator",
                }[prefix] || null),
            5, null);
        result.__iterator__ = function () { let elem; while ((elem = this.iterateNext())) yield elem; };
        return result;
    }

    function httpGet(url)
    {
        try
        {
            let xmlhttp = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
            xmlhttp.open("GET", url, false);
            xmlhttp.send(null);
            return xmlhttp;
        }
        catch (e) {}
    }

    const self = this;
    this.HELP_TAGS = {};
    this.FILE_MAP = {};
    var NAMESPACES = null;
    var HELP_FILES = null;

    function parseHelpTags(files)
    {
        const XSLT = Cc["@mozilla.org/document-transformer;1?type=xslt"].createInstance(Ci.nsIXSLTProcessor);
        XSLT.importStylesheet(httpGet("chrome://liberator/content/help.xsl").responseXML);
        for each (let file in files)
        {
            try
            {
                for each (let namespace in NAMESPACES)
                {
                    let url = ["chrome://", namespace, "/locale/", file, ".xml"].join("");
                    let res = httpGet(url);
                    if (res && res.responseXML.documentElement.localName == "document")
                    {
                        self.FILE_MAP[file] = url;
                        let doc = XSLT.transformToDocument(res.responseXML);
                        for (let elem in xpath(doc, "//liberator:tag/text()"))
                            self.HELP_TAGS[elem.textContent] = file;
                        break;
                    }
                }
            }
            catch (e)
            {
                Components.utils.reportError(e);
                dump(e);
            }
        }
        HELP_FILES = Array.slice(files);
    }
}
Liberator.prototype = {
    contractID:       "@mozilla.org/network/protocol;1?name=liberator",
    classID:          Components.ID("{9c8f2530-51c8-4d41-b356-319e0b155c44}"),
    classDescription: "Liberator utility protocol",
    QueryInterface:   XPCOMUtils.generateQI([Components.interfaces.nsIProtocolHandler]),
    _xpcom_factory: {
        createInstance: function (outer, iid)
        {
            if (!Liberator.instance)
                Liberator.instance = new Liberator();
            if (outer != null)
                throw Components.results.NS_ERROR_NO_AGGREGATION;
            return Liberator.instance.QueryInterface(iid);
        }
    },

    scheme: "liberator",
    defaultPort: -1,
    allowPort: function (port, scheme) false,
    protocolFlags: 0
         | nsIProtocolHandler.URI_IS_UI_RESOURCE
         | nsIProtocolHandler.URI_IS_LOCAL_RESOURCE,

    newURI: function (spec, charset, baseURI)
    {
        var uri = Components.classes["@mozilla.org/network/standard-url;1"]
                            .createInstance(Components.interfaces.nsIStandardURL)
                            .QueryInterface(Components.interfaces.nsIURI);
        uri.init(uri.URLTYPE_STANDARD, this.defaultPort, spec, charset, baseURI);
        return uri;
    },

    newChannel: function (uri)
    {
        try
        {
            switch(uri.host)
            {
                case "help":
                    let url = this.FILE_MAP[uri.path.replace(/^\/|#.*/g, "")];
                    if (!url)
                        break;
                    return makeChannel(url, uri);
                case "help-tag":
                    let tag = uri.path.substr(1);
                    if (tag in this.HELP_TAGS)
                        return redirect("liberator://help/" + this.HELP_TAGS[tag] + "#" + tag, uri);
            }
        }
        catch (e) {}
        return fakeChannel(uri);
    }
};

var components = [ChromeData, Liberator];

function NSGetModule(compMgr, fileSpec)
{
    return XPCOMUtils.generateModule(components);
}

// vim: set fdm=marker sw=4 ts=4 et:
