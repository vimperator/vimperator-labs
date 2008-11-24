const template = {
    add: function add(a, b) a + b,
    join: function join(c) function (a, b) a + c + b,

    map: function map(iter, fn, sep)
    {
        if (iter.length) /* Kludge? */
            iter = util.Array.iterator(iter);
        let ret = <></>;
        let n = 0;
        for each (let i in Iterator(iter))
        {
            let val = fn(i);
            if (val == undefined)
                continue;
            if (sep && n++)
                ret += sep;
            ret += val;
        }
        return ret;
    },

    maybeXML: function maybeXML(xml)
    {
        if (typeof xml == "xml")
            return xml;
        try
        {
            return new XMLList(xml);
        }
        catch (e) {}
        return <>{xml}</>;
    },

    completionRow: function completionRow(context, item, class)
    {
        if (typeof icon == "function")
            icon = icon();

        if (class)
        {
            var [text, desc] = item;
        }
        else
        {
            var text = context.process[0].call(context, item, item.text || context.getKey(item, "text"));
            var desc = context.process[1].call(context, item, context.getKey(item, "description"));
        }

        return <ul class={class || "hl-CompItem"}>
                   <li class="hl-CompResult">{text || ""}</li>
                   <li class="hl-CompDesc">{desc || ""}</li>
               </ul>;
    },

    bookmarkDescription: function (item, text)
    <>
        <a href="#" class="hl-URL">{text}</a>&#160;
        {
            !(item.item.extra.length) ? "" :
            <span class="extra-info">
                ({
                    template.map(item.item.extra, function (e)
                    <>{e[0]}: <span class={e[2]}>{e[1]}</span></>,
                    <>&#xa0;</>/* Non-breaking space */)
                })
            </span>
        }
    </>,

    icon: function (item, text)
    {
        let icon = this.getKey(item, "icon");
        return <><span class="hl-CompIcon">{icon ? <img src={icon}/> : <></>}</span>{text}</>
    },

    filter: function (str) <span class="hl-Filter">{str}</span>,

    // if "processStrings" is true, any passed strings will be surrounded by " and
    // any line breaks are displayed as \n
    highlight: function highlight(arg, processStrings, clip)
    {
        // some objects like window.JSON or getBrowsers()._browsers need the try/catch
        let str = clip ? util.clip(String(arg), clip) : String(arg);
        try
        {
            switch (arg == null ? "undefined" : typeof arg)
            {
                case "number":
                    return <span class="hl-Number">{str}</span>;
                case "string":
                    if (processStrings)
                        str = <>{util.escapeString(str)}</>;
                    return <span class="hl-String">{str}</span>;
                case "boolean":
                    return <span class="hl-Boolean">{str}</span>;
                case "function":
                    // Vim generally doesn't like /foo*/, because */ looks like a comment terminator.
                    // Using /foo*(:?)/ instead.
                    if (processStrings)
                        return <span class="hl-Function">{str.replace(/\{(.|\n)*(?:)/g, "{ ... }")}</span>;
                    return <>{arg}</>;
                case "undefined":
                    return <span class="hl-Null">{arg}</span>;
                case "object":
                    // for java packages value.toString() would crash so badly
                    // that we cannot even try/catch it
                    if (/^\[JavaPackage.*\]$/.test(arg))
                        return <>[JavaPackage]</>;
                    if (processStrings && false)
                        str = template.highlightFilter(str, "\n", function () <span class="hl-NonText">^J</span>);
                    return <span class="hl-Object">{str}</span>;
                case "xml":
                    return arg;
                default:
                    return <![CDATA[<unknown type>]]>;
            }
        }
        catch (e)
        {
            return<![CDATA[<unknown>]]>;
        }
    },

    highlightFilter: function highlightFilter(str, filter, highlight)
    {
        return this.highlightSubstrings(str, (function ()
        {
            if (filter.length == 0)
                return;
            let lcstr = String.toLowerCase(str);
            let lcfilter = filter.toLowerCase();
            let start = 0;
            while ((start = lcstr.indexOf(lcfilter, start)) > -1)
            {
                yield [start, filter.length];
                start += filter.length;
            }
        })(), highlight || template.filter);
    },

    highlightRegexp: function highlightRegexp(str, re, highlight)
    {
        return this.highlightSubstrings(str, (function ()
        {
            while (res = re.exec(str) && res[0].length)
                yield [res.index, res[0].length];
        })(), highlight || template.filter);
    },

    highlightSubstrings: function highlightSubstrings(str, iter, highlight)
    {
        if (typeof str == "xml")
            return str;
        if (str == "")
            return <>{str}</>;

        str = String(str).replace(" ", "\u00a0");
        let s = <></>;
        let start = 0;
        for (let [i, length] in iter)
        {
            XML.ignoreWhitespace = false;
            s += <>{str.substring(start, i)}</>;
            s += highlight(str.substr(i, length));
            start = i + length;
        }
        return s + <>{str.substr(start)}</>;
    },

    highlightURL: function highlightURL(str, force)
    {
        if (force || /^[a-zA-Z]+:\/\//.test(str))
            return <a class="hl-URL" href="#">{str}</a>;
        else
            return str;
    },

    generic: function generic(xml)
    {
        return <>:{commandline.getCommand()}<br/></> + xml;
    },

    // every item must have a .xml property which defines how to draw itself
    // @param headers is an array of strings, the text for the header columns
    genericTable: function genericTable(headers, items)
    {
        return this.generic(
            <table>
                <tr align="left" class="hl-Title">
                {
                    headers.reduce(function (prev, cur) prev + <th>{cur}</th>, <></>)
                }
                </tr>
                {
                     this.map(items, function (item) item.xml)
                }
            </table>);
    },

    // returns a single row for a bookmark or history item
    bookmarkItem: function bookmarkItem(item)
    {
        var extra = [];
        if (item.keyword)
            extra.push(['keyword', item.keyword, "hl-Keyword"]);
        if (item.tags && item.tags.length > 0)
            extra.push(["tags", item.tags.join(","), "hl-Tag"]); // no space, otherwise it looks strange, since we just have spaces to seperate tags from keywords

        return <ul class="hl-CompItem">
            <li class="hl-CompIcon"><img src={item.icon || ""}/></li>
            <li class="hl-CompResult">{util.clip(item.title || "", 50)}</li>
            <li style="width: 100%">
                <a href="#" class="hl-URL">{item.url}</a>&#160;
                {
                    !(extra.length) ? "" :
                    <span class="extra-info">
                        ({
                            template.map(extra, function (e)
                            <>{e[0]}: <span class={e[2]}>{e[1]}</span></>,
                            <>&#xa0;</>/* Non-breaking space */)
                        })
                    </span>
                }
            </li>
        </ul>
    },

    jumps: function jumps(index, elems)
    {
        return this.generic(
            <table>
                <tr style="text-align: left;" class="hl-Title">
                    <th colspan="2">jump</th><th>title</th><th>URI</th>
                </tr>
                {
                    this.map(Iterator(elems), function ([idx, val])
                    <tr>
                        <td class="indicator">{idx == index ? ">" : ""}</td>
                        <td>{Math.abs(idx - index)}</td>
                        <td style="width: 250px; max-width: 500px; overflow: hidden;">{val.title}</td>
                        <td><a href="#" class="hl-URL jump-list">{val.URI.spec}</a></td>
                    </tr>)
                }
            </table>);
    },

    options: function options(title, opts)
    {
        return this.generic(
            <table>
                <tr class="hl-Title" align="left">
                    <th>--- {title} ---</th>
                </tr>
                {
                    this.map(opts, function (opt)
                    <tr>
                        <td>
                            <span style={opt.isDefault ? "" : "font-weight: bold"}>{opt.pre}{opt.name}</span><span>{opt.value}</span>
                            {opt.isDefault || opt.default == null ? "" : <span class="extra-info"> (default: {opt.default})</span>}
                        </td>
                    </tr>)
                }
            </table>);
    },

    table: function table(title, data, indent)
    {
        let table =
            <table>
                <tr class="hl-Title" align="left">
                    <th colspan="2">{title}</th>
                </tr>
                {
                    this.map(data, function (datum)
                    <tr>
                       <td style={"font-weight: bold; min-width: 150px; padding-left: " + (indent || "2ex")}>{datum[0]}</td>
                       <td>{template.maybeXML(datum[1])}</td>
                    </tr>)
                }
            </table>;
        if (table.tr.length() > 1)
            return table;
    },

    tabular: function tabular(headings, style, iter)
    {
        /* This might be mind-bogglingly slow. We'll see. */
        return this.generic(
            <table>
                <tr class="hl-Title" align="left">
                {
                    this.map(headings, function (h)
                    <th>{h}</th>)
                }
                </tr>
                {
                    this.map(iter, function (row)
                    <tr>
                    {
                        template.map(Iterator(row), function ([i, d])
                        <td style={style[i] || ""}>{d}</td>)
                    }
                    </tr>)
                }
            </table>);
    },

    usage: function usage(iter)
    {
        return this.generic(
            <table>
            {
                this.map(iter, function (item)
                <tr>
                    <td class="hl-Title" style="padding-right: 20px">{item.name || item.names[0]}</td>
                    <td>{item.description}</td>
                </tr>)
            }
            </table>);
    }
};

// vim: set fdm=marker sw=4 ts=4 et:
