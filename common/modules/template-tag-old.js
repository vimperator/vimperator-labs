// TODO: delete me when minVersion is greater than 34

var EXPORTED_SYMBOLS = ["xml", "TemplateSupportsXML"];
(function () {
    var {xml, TemplateSupportsXML} = Components.utils.import("resource://liberator/template-tag.js", {});
    this.xml = function xml_tagged_hack(portion, args) {
        try {
            return xml.apply(xml, [portion].concat(args));
        } catch (ex) {
            Components.utils.reportError(ex);
            Components.utils.reportError(ex.stack);
            throw ex;
        }
    };

    for (var a in xml)
        this.xml[a] = xml[a];
    this.TemplateSupportsXML = TemplateSupportsXML;
}).call(this);
