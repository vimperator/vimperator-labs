/***** BEGIN LICENSE BLOCK ***** {{{
 ©2008 Kris Maglione <maglione.k at Gmail>
 Distributable under the terms of the MIT license, which allows
 for sublicensing under any compatible license, including the MPL,
 GPL, and MPL. Anyone who changes this file is welcome to relicense
 it under any or all of those licenseses.
}}} ***** END LICENSE BLOCK *****/

/** @scope modules */

/**
 * @constant
 * @property {string} The default highlighting rules. They have the
 * form:
 *    rule ::= selector space css
 *    selector ::= group
 *               | group "," css-selector
 *               | group "," css-selector "," scope
 *    group ::= groupname
 *            | groupname css-selector
 */
// <css>
Highlights.prototype.CSS = <![CDATA[
    Boolean     color: red;
    Function    color: navy;
    Null        color: blue;
    Number      color: blue;
    Object      color: maroon;
    String      color: green;

    Normal      color: black; background: white;
    ErrorMsg    color: white; background: red; font-weight: bold;
    InfoMsg     color: black; background: white;
    ModeMsg     color: black; background: white;
    MoreMsg     color: green; background: white;
    WarningMsg  color: red; background: white;
    Message     white-space: normal; min-width: 100%; padding-left: 2em; text-indent: -2em; display: block;
    NonText     color: blue; min-height: 16px; padding-left: 2px;
    Preview     color: gray;

    CmdLine,>*  font-family: monospace; padding: 1px;
    CmdOutput   white-space: pre;

    CompGroup
    CompGroup:not(:first-of-type) margin-top: .5em;
    CompTitle          color: magenta; background: white; font-weight: bold;
    CompTitle>*        padding: 0 .5ex;
    CompMsg            font-style: italic; margin-left: 16px;
    CompItem
    CompItem[selected] background: yellow;
    CompItem>*         padding: 0 .5ex;
    CompIcon           width: 16px; min-width: 16px; display: inline-block; margin-right: .5ex;
    CompIcon>img       max-width: 16px; max-height: 16px; vertical-align: middle;
    CompResult         width: 45%; overflow: hidden;
    CompDesc           color: gray; width: 50%;
    CompLess           text-align: center; height: 0;    line-height: .5ex; padding-top: 1ex;
    CompLess::after    content: "\2303" /* Unicode up arrowhead */
    CompMore           text-align: center; height: .5ex; line-height: .5ex; margin-bottom: -.5ex;
    CompMore::after    content: "\2304" /* Unicode down arrowhead */

    Gradient        height: 1px; margin-bottom: -1px; margin-top: -1px;
    GradientLeft    background-color: magenta;
    GradientRight   background-color: white;

    Indicator   color: blue;
    Filter      font-weight: bold;

    Keyword     color: red;
    Tag         color: blue;

    LineNr      color: orange; background: white;
    Question    color: green; background: white; font-weight: bold;

    StatusLine       color: white; background: black;
    StatusLineBroken color: black; background: #FF6060; /* light-red */
    StatusLineSecure color: black; background: #B0FF00; /* light-green */

    TabClose
    TabIcon
    TabText
    TabNumber      font-weight: bold; margin: 0px; padding-right: .3ex;
    TabIconNumber {
        font-weight: bold;
        color: white;
        text-align: center;
        text-shadow: black -1px 0 1px, black 0 1px 1px, black 1px 0 1px, black 0 -1px 1px;
    }

    Title       color: magenta; background: white; font-weight: bold;
    URL         text-decoration: none; color: green; background: inherit;
    URL:hover   text-decoration: underline; cursor: pointer;

    FrameIndicator,,* {
        background-color: red;
        opacity: 0.5;
        z-index: 999;
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
    }

    Bell         border: none; background-color: black;
    Hint,,* {
        font-family: monospace;
        font-size: 10px;
        font-weight: bold;
        color: white;
        background-color: red;
        border-color: ButtonShadow;
        border-width: 0px;
        border-style: solid;
        padding: 0px 1px 0px 1px;
    }
    Hint::after,,*  content: attr(number);
    HintElem,,*     background-color: yellow;  color: black;
    HintActive,,*   background-color: #88FF00; color: black;
    HintImage,,*    opacity: .5;

    Search,,* {
        font-size: inherit;
        padding: 0;
        color: black;
        background-color: yellow;
        padding: 0;
    }
    ]]>.toString();

/**
 * A class to manage highlighting rules. The parameters are the
 * standard paramaters for any {@link Storage} object.
 *
 * @author Kris Maglione <maglione.k@gmail.com>
 */
function Highlights(name, store, serial)
{
    var self = this;
    var highlight = {};
    var styles = storage.styles;

    const Highlight = Struct("class", "selector", "filter", "default", "value");
    Highlight.defaultValue("filter", function () "chrome://liberator/content/buffer.xhtml" + "," + config.styleableChrome);
    Highlight.defaultValue("selector", function () self.selector(this.class));
    Highlight.defaultValue("value", function () this.default);
    Highlight.prototype.toString = function () "Highlight(" + this.class + ")\n\t" + [k + ": " + util.escapeString(v || "undefined") for ([k, v] in this)].join("\n\t");

    function keys() [k for ([k, v] in Iterator(highlight))].sort();

    this.__iterator__ = function () (highlight[v] for ([k, v] in Iterator(keys())));

    this.get = function (k) highlight[k];
    this.set = function (key, newStyle, force, append)
    {
        let [, class, selectors] = key.match(/^([a-zA-Z_-]+)(.*)/);

        if (!(class in highlight))
            return "Unknown highlight keyword: " + class;

        let style = highlight[key] || new Highlight(key);
        styles.removeSheet(true, style.selector);

        if (append)
            newStyle = (style.value || "").replace(/;?\s*$/, "; " + newStyle);
        if (/^\s*$/.test(newStyle))
            newStyle = null;
        if (newStyle == null)
        {
            if (style.default == null)
            {
                delete highlight[style.class];
                styles.removeSheet(true, style.selector);
                return null;
            }
            newStyle = style.default;
            force = true;
        }

        let css = newStyle.replace(/(?:!\s*important\s*)?(?:;?\s*$|;)/g, "!important;")
                          .replace(";!important;", ";", "g"); // Seeming Spidermonkey bug
        css = style.selector + " { " + css + " }";

        let error = styles.addSheet(true, style.selector, style.filter, css);
        if (error)
            return error;
        style.value = newStyle;
        highlight[style.class] = style;
    };

    /**
     * Gets a CSS selector given a highlight group.
     */
    this.selector = function (class)
    {
        let [, hl, rest] = class.match(/^(\w*)(.*)/);
        return "[liberator|highlight~=" + hl + "]" + rest
    };

    /**
     * Clears all highlighting rules. Rules with default values are
     * reset.
     */
    this.clear = function ()
    {
        for (let [k, v] in Iterator(highlight))
            this.set(k, null, true);
    };

    /**
     * Reloads the values in {@link #CSS}.
     */
    this.reload = function ()
    {
        this.CSS.replace(/\{((?:.|\n)*?)\}/g, function (_, _1) _1.replace(/\n\s*/g, " "))
                .split("\n").filter(function (s) /\S/.test(s))
                .forEach(function (style)
        {
            style = Highlight.apply(Highlight, Array.slice(style.match(/^\s*([^,\s]+)(?:,([^,\s]+)?)?(?:,([^,\s]+))?\s*(.*)$/), 1));
            if (/^[>+ ]/.test(style.selector))
                style.selector = self.selector(style.class + style.selector);

            let old = highlight[style.class];
            highlight[style.class] = style;
            if (old && old.value != old.default)
                style.value = old.value;
        });
        for (let [class, hl] in Iterator(highlight))
        {
            if (hl.value == hl.default)
                this.set(class);
        }
    };
}

/**
 * Manages named and unnamed user stylesheets, which apply to both
 * chrome and content pages. The parameters are the standard
 * paramaters for any {@link Storage} object.
 *
 * @author Kris Maglione <maglione.k@gmail.com>
 */
function Styles(name, store, serial)
{
    /* Can't reference liberator or Components inside Styles --
     * they're members of the window object, which disappear
     * with this window.
     */
    const util = modules.util;
    const sleep = liberator.sleep;
    const storage = modules.storage;
    const consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
    const ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
    const namespace = '@namespace html "' + XHTML + '";\n' +
                      '@namespace xul "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";\n' +
                      '@namespace liberator "' + NS.uri + '";\n';
    const Sheet = new Struct("name", "sites", "css", "ref");

    let cssUri = function (css) "chrome-data:text/css," + encodeURI(css);

    let userSheets = [];
    let systemSheets = [];
    let userNames = {};
    let systemNames = {};

    this.__iterator__ = function () Iterator(userSheets.concat(systemSheets));
    this.__defineGetter__("systemSheets", function () Iterator(systemSheets));
    this.__defineGetter__("userSheets", function () Iterator(userSheets));
    this.__defineGetter__("systemNames", function () Iterator(systemNames));
    this.__defineGetter__("userNames", function () Iterator(userNames));

    /**
     * Add a new stylesheet.
     *
     * @param {boolean} system Declares whether this is a system or
     *     user sheet. System sheets are used internally by
     *     @liberator.
     * @param {string} name The name given to the stylesheet by
     *     which it may be later referenced.
     * @param {string} filter The sites to which this sheet will
     *     apply. Can be a domain name or a URL. Any URL ending in
     *     "*" is matched as a prefix.
     * @param {string} css The CSS to be applied.
     */
    this.addSheet = function (system, name, filter, css)
    {
        let sheets = system ? systemSheets : userSheets;
        let names = system ? systemNames : userNames;
        if (name && name in names)
            this.removeSheet(system, name);

        let sheet = sheets.filter(function (s) s.sites.join(",") == filter && s.css == css)[0];
        if (!sheet)
            sheet = new Sheet(name, filter.split(",").filter(util.identity), css, null);

        if (sheet.ref == null) // Not registered yet
        {
            sheet.ref = [];
            try
            {
                this.registerSheet(cssUri(wrapCSS(sheet)));
                this.registerAgentSheet(cssUri(wrapCSS(sheet)))
            }
            catch (e)
            {
                return e.echoerr || e;
            }
            sheets.push(sheet);
        }
        if (name)
        {
            sheet.ref.push(name);
            names[name] = sheet;
        }
        return null;
    };

    /**
     * Get a sheet with a given name or index.
     *
     * @param {boolean} system
     * @param {string or number} sheet The sheet to retrieve. Strings indicate
     *     sheet names, while numbers indicate indices.
     */
    this.get = function get(system, sheet)
    {
        let sheets = system ? systemSheets : userSheets;
        let names = system ? systemNames : userNames;
        if (typeof sheet == "number")
            return sheets[sheet];
        return names[sheet]
    };

    /**
     * Find sheets matching the parameters. See {@link #addSheet}
     * for parameters.
     */
    this.findSheets = function (system, name, filter, css, index)
    {
        let sheets = system ? systemSheets : userSheets;
        let names = system ? systemNames : userNames;

        // Grossly inefficient.
        let matches = [k for ([k, v] in Iterator(sheets))];
        if (index)
            matches = String(index).split(",").filter(function (i) i in sheets);
        if (name)
            matches = matches.filter(function (i) sheets[i] == names[name]);
        if (css)
            matches = matches.filter(function (i) sheets[i].css == css);
        if (filter)
            matches = matches.filter(function (i) sheets[i].sites.indexOf(filter) >= 0);
        return matches.map(function (i) sheets[i]);
    };

    /**
     * Remove a stylesheet. See {@link #addSheet} for parameters.
     * In cases where <b>filter</b> is supplied, the given filters
     * are removed from matching sheets. If any remain, the sheet is
     * left in place.
     */
    this.removeSheet = function (system, name, filter, css, index)
    {
        let self = this;
        let sheets = system ? systemSheets : userSheets;
        let names = system ? systemNames : userNames;

        if (filter && filter.indexOf(",") > -1)
            return filter.split(",").reduce(
                function (n, f) n + self.removeSheet(system, name, f, index), 0);

        if (filter == undefined)
            filter = "";

        let matches = this.findSheets(system, name, filter, css, index);
        if (matches.length == 0)
            return;

        for (let [,sheet] in Iterator(matches.reverse()))
        {
            if (name)
            {
                if (sheet.ref.indexOf(name) > -1)
                    sheet.ref.splice(sheet.ref.indexOf(name), 1);
                delete names[name];
            }
            if (!sheet.ref.length)
            {
                this.unregisterSheet(cssUri(wrapCSS(sheet)));
                this.unregisterAgentSheet(cssUri(wrapCSS(sheet)));
                if (sheets.indexOf(sheet) > -1)
                    sheets.splice(sheets.indexOf(sheet), 1);
            }
            if (filter)
            {
                let sites = sheet.sites.filter(function (f) f != filter);
                if (sites.length)
                    this.addSheet(system, name, sites.join(","), css);
            }
        }
        return matches.length;
    };

    /**
     * Register a user stylesheet at the given URI.
     *
     * @param {string} uri The UrI of the sheet to register.
     * @param {boolean} reload Whether to reload any sheets that are
     *     already registered.
     */
    this.registerSheet = function (uri, reload)
    {
        if (reload)
            this.unregisterSheet(uri);
        uri = ios.newURI(uri, null, null);
        if (reload || !sss.sheetRegistered(uri, sss.USER_SHEET))
            sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
    };

    /**
     * Unregister a sheet at the given URI.
     */
    this.unregisterSheet = function (uri)
    {
        uri = ios.newURI(uri, null, null);
        if (sss.sheetRegistered(uri, sss.USER_SHEET))
            sss.unregisterSheet(uri, sss.USER_SHEET);
    };

    // FIXME
    /**
     * Register an agent stylesheet.
     * @deprecated
     */
    this.registerAgentSheet = function (uri)
    {
        this.unregisterAgentSheet(uri);
        uri = ios.newURI(uri, null, null);
        sss.loadAndRegisterSheet(uri, sss.AGENT_SHEET);
    };

    /**
     * Unregister an agent stylesheet.
     * @deprecated
     */
    this.unregisterAgentSheet = function (uri)
    {
        uri = ios.newURI(uri, null, null);
        if (sss.sheetRegistered(uri, sss.AGENT_SHEET))
            sss.unregisterSheet(uri, sss.AGENT_SHEET);
    };

    function wrapCSS(sheet)
    {
        let filter = sheet.sites;
        let css = sheet.css;
        if (filter[0] == "*")
            return namespace + css;
        let selectors = filter.map(function (part) (/[*]$/.test(part)   ? "url-prefix" :
                                                    /[\/:]/.test(part)  ? "url"
                                                                        : "domain")
                                            + '("' + part.replace(/"/g, "%22").replace(/[*]$/, "") + '")')
                              .join(", ");
        return namespace + "@-moz-document " + selectors + "{\n" + css + "\n}\n";
    }
}
let (array = util.Array)
{
    Styles.prototype = {
        get sites() array.uniq(array.flatten([v.sites for ([k, v] in this.userSheets)])),
        completeSite: function (context, content)
        {
            let compl = [];
            try
            {
                compl.push([content.location.host, "Current Host"]);
                compl.push([content.location.href, "Current URL"]);
            }
            catch (e) {}
            context.anchored = false;
            context.completions = compl.concat([[s, ""] for each (s in styles.sites)]);
        }
    };
}

/**
 * @property {Styles}
 */
const styles = storage.newObject("styles", Styles, false);

/**
 * @property {Highlights}
 */
const highlight = storage.newObject("highlight", Highlights, false);

highlight.CSS = Highlights.prototype.CSS;
highlight.reload();

liberator.triggerObserver("load_styles", "styles");
liberator.triggerObserver("load_highlight", "highlight");

liberator.registerObserver("load_completion", function ()
{
    completion.setFunctionCompleter(["get", "addSheet", "removeSheet", "findSheets"].map(function (m) styles[m]),
        [ // Prototype: (system, name, filter, css, index)
            null,
            function (context, obj, args) args[0] ? styles.systemNames : styles.userNames,
            function (context, obj, args) styles.completeSite(context, content),
            null,
            function (context, obj, args) args[0] ? styles.systemSheets : styles.userSheets
        ]);
});

liberator.registerObserver("load_commands", function ()
{
    // TODO: :colo default needs :hi clear
    commands.add(["colo[rscheme]"],
        "Load a color scheme",
        function (args)
        {
            let scheme = args[0];

            if (scheme == "default")
                highlight.clear();
            else if (!io.sourceFromRuntimePath(["colors/" + scheme + ".vimp"]))
                return liberator.echoerr("E185: Cannot find color scheme " + scheme);
            autocommands.trigger("ColorScheme", { name: scheme });
        },
        {
            argCount: "1",
            completer: function (context) completion.colorScheme(context)
        });

    commands.add(["sty[le]"],
        "Add or list user styles",
        function (args)
        {
            let [filter, css] = args;
            let name = args["-name"];

            if (!css)
            {
                let list = Array.concat([i for (i in styles.userNames)],
                                        [i for (i in styles.userSheets) if (!i[1].ref.length)]);
                let str = template.tabular(["", "Filter", "CSS"],
                    ["padding: 0 1em 0 1ex; vertical-align: top", "padding: 0 1em 0 0; vertical-align: top"],
                    ([k, v[1].join(","), v[2]]
                     for ([i, [k, v]] in Iterator(list))
                     if ((!filter || v[1].indexOf(filter) >= 0) && (!name || v[0] == name))));
                commandline.echo(str, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
            }
            else
            {
                if ("-append" in args)
                {
                    let sheet = styles.get(false, name);
                    if (sheet)
                    {
                        filter = sheet.sites.concat(filter).join(",");
                        css = sheet.css.replace(/;?\s*$/, "; " + css);
                    }
                }
                let err = styles.addSheet(false, name, filter, css);
                if (err)
                    liberator.echoerr(err);
            }
        },
        {
            bang: true,
            completer: function (context, args)
            {
                let compl = [];
                if (args.completeArg == 0)
                {
                    styles.completeSite(context, content);
                }
                else if (args.completeArg == 1)
                {
                    let sheet = styles.get(false, args["-name"]);
                    if (sheet)
                        context.completions = [[sheet.css, "Current Value"]];
                }
            },
            hereDoc: true,
            literal: 1,
            options: [[["-name", "-n"], commands.OPTION_STRING, null, function () [[k, v.css] for ([k, v] in Iterator(styles.userNames))]],
                      [["-append", "-a"], commands.OPTION_NOARG]],
            serial: function () [
                {
                    command: this.name,
                    bang: true,
                    options: sty.name ? { "-name": sty.name } : {},
                    arguments: [sty.sites.join(",")],
                    literalArg: sty.css
                } for ([k, sty] in styles.userSheets)
            ]
        });

    commands.add(["dels[tyle]"],
        "Remove a user stylesheet",
        function (args)
        {
            styles.removeSheet(false, args["-name"], args[0], args.literalArg, args["-index"]);
        },
        {
            completer: function (context) { context.completions = styles.sites.map(function (site) [site, ""]); },
            literal: 1,
            options: [[["-index", "-i"], commands.OPTION_INT, null, function () [[i, <>{s.sites.join(",")}: {s.css.replace("\n", "\\n")}</>] for ([i, s] in styles.userSheets)]],
                      [["-name", "-n"],  commands.OPTION_STRING, null, function () [[k, v.css] for ([k, v] in Iterator(styles.userNames))]]]
        });

    commands.add(["hi[ghlight]"],
        "Set the style of certain display elements",
        function (args)
        {
            let style = <![CDATA[
                ;
                display: inline-block !important;
                position: static !important;
                margin: 0px !important; padding: 0px !important;
                width: 3em !important; min-width: 3em !important; max-width: 3em !important;
                height: 1em !important; min-height: 1em !important; max-height: 1em !important;
                overflow: hidden !important;
            ]]>;
            let clear = args[0] == "clear";
            if (clear)
                args.shift();

            let [key, css] = args;
            if (clear && css)
                return liberator.echo("E488: Trailing characters");

            if (!css && !clear)
            {
                // List matching keys
                let str = template.tabular(["Key", "Sample", "CSS"],
                    ["padding: 0 1em 0 0; vertical-align: top", "text-align: center"],
                    ([h.class,
                      <span style={"text-align: center; line-height: 1em;" + h.value + style}>XXX</span>,
                      template.highlightRegexp(h.value, /\b[-\w]+(?=:)/g)]
                        for (h in highlight)
                        if (!key || h.class.indexOf(key) > -1)));
                commandline.echo(str, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
                return;
            }
            if (!key && clear)
                return highlight.clear();
            let error = highlight.set(key, css, clear, "-append" in args);
            if (error)
                liberator.echoerr(error);
        },
        {
            // TODO: add this as a standard highlight completion function?
            completer: function (context, args)
            {
                // Complete a highlight group on :hi clear ...
                if (args.completeArg > 0 && args[0] == "clear")
                    args.completeArg = args.completeArg > 1 ? -1 : 0;

                if (args.completeArg == 0)
                    context.completions = [[v.class, ""] for (v in highlight)];
                else if (args.completeArg == 1)
                {
                    let hl = highlight.get(args[0]);
                    if (hl)
                        context.completions = [[hl.value, "Current Value"], [hl.default || "", "Default Value"]];
                }
            },
            hereDoc: true,
            literal: 1,
            options: [[["-append", "-a"], commands.OPTION_NOARG]],
            serial: function () [
                {
                    command: this.name,
                    arguments: [k],
                    literalArg: v
                }
                for ([k, v] in Iterator(highlight))
                if (v.value != v.default)
            ]
        });
});

// vim: set fdm=marker sw=4 ts=4 et:
