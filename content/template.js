const template = {
    add: function (a, b) a + b,
    join: function (c) function (a, b) a + c + b,

    map: function (iter, fn, sep)
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

    maybeXML: function (xml)
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

    // if "processStrings" is true, any passed strings will be surrounded by " and
    // any line breaks are displayed as \n
    highlight: function (arg, processStrings)
    {
        // some objects like window.JSON or getBrowsers()._browsers need the try/catch
        try
        {
            switch (arg == null ? "undefined" : typeof arg)
            {
                case "number":
                    return <span class="hl-Number">{arg}</span>;
                case "string":
                    if (processStrings)
                        arg = <>{util.escapeString(arg)}</>;
                    return <span class="hl-String">{arg}</span>;
                case "boolean":
                    return <span class="hl-Boolean">{arg}</span>;
                case "function":
                    // Vim generally doesn't like /foo*/, because */ looks like a comment terminator.
                    // Using /foo*(:?)/ instead.
                    if (processStrings)
                        return <span class="hl-Function">{String(arg).replace(/\{(.|\n)*(?:)/g, "{ ... }")}</span>;
                    return <>{arg}</>;
                case "undefined":
                    return <span class="hl-Null">{arg}</span>;
                case "object":
                    // for java packages value.toString() would crash so badly
                    // that we cannot even try/catch it
                    if (/^\[JavaPackage.*\]$/.test(arg))
                        return <>[JavaPackage]</>;
                    if (processStrings)
                        arg = String(arg).replace("\n", "\\n", "g");
                    return <span class="hl-Object">{arg}</span>;
                default:
                    return <![CDATA[<unknown type>]]>;
            }
        }
        catch (e)
        {
            return<![CDATA[<unknown>]]>;
        }
    },

    highlightFilter: function (str, filter)
    {
        if (typeof str == "xml")
            return str;

        return this.highlightSubstrings(str, (function ()
        {
            let lcstr = String.toLowerCase(str);
            let lcfilter = filter.toLowerCase();
            let start = 0;
            while ((start = lcstr.indexOf(lcfilter, start)) > -1)
            {
                yield [start, filter.length];
                start += filter.length;
            }
        })());
    },

    highlightRegexp: function (str, re)
    {
        if (typeof str == "xml")
            return str;

        return this.highlightSubstrings(str, (function ()
        {
            while (res = re.exec(str))
                yield [res.index, res[0].length];
        })());
    },

    highlightSubstrings: function (str, iter)
    {
        if (typeof str == "xml")
            return str;
        if (str == "")
            return <>{str}</>;

        XML.ignoreWhitespace = false;
        str = String(str).replace(" ", "\u00a0");
        let s = <></>;
        let start = 0;
        for (let [i, length] in iter)
        {
            s += <>{str.substring(start, i)}</>;
            s += <span class="hl-Filter">{str.substr(i, length)}</span>;
            start = i + length;
        }
        return s + <>{str.substr(start)}</>;
    },

    highlightURL: function (str, force)
    {
        if (force || /^[a-zA-Z]+:\/\//.test(str))
            return <a class="hl-URL" href="#">{str}</a>;
        else
            return str;
    },

    generic: function (xml)
    {
        return <>:{commandline.getCommand()}<br/></> + xml;
    },

    bookmarks: function (header, items)
    {
        return this.generic(
            <table>
                <tr align="left" class="hl-Title">
                    <th>{header}</th><th>URL</th>
                </tr>
                {
                    this.map(items, function (item)
                    <tr>
                        <td>{util.clip(item.title, 50)}</td>
                        <td style="width: 100%">
                            <a href="#" class="hl-URL">{item.url}</a>&#160;
                            {
                                !(item.extra && item.extra.length) ? "" :
                                <span class="extra-info">
                                    ({
                                        template.map(item.extra, function (e)
                                        <>{e[0]}: <span class={e[2]}>{e[1]}</span></>,
                                        <>&#xa0;</>/* Non-breaking space */)
                                    })
                                </span>
                            }
                        </td>
                    </tr>)
                }
            </table>);
    },

    jumps: function (index, elems)
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

    options: function (title, opts)
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
                            <span style={opt.isDefault ? "" : "font-weight: bold"}>{opt.pre}{opt.name}{opt.value}</span>
                            {opt.isDefault || opt.default == null ? "" : <span class="extra-info"> (default: {opt.default})</span>}
                        </td>
                    </tr>)
                }
            </table>);
    },

    table: function (title, data, indent)
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

    tabular: function (headings, style, iter)
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

    usage: function (iter)
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
