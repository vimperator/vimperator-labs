
liberator.template = {
    add: function (a, b) a + b,
    join: function (c) function (a, b) a + c + b,

    map: function (iter, fn, sep)
    {
        if (iter.length) /* Kludge? */
            iter = liberator.util.arrayIter(iter);
        let ret = <></>;
        let n = 0;
        for each (let i in iter)
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
    map2: function (iter, fn, sep)
    {
        // Could cause performance problems.
        return this.map(Iterator(iter), function (x) fn.apply(null, x), sep);
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
                        arg = <>{liberator.util.escapeString(arg)}</>;
                    return <span class="hl-String">{arg}</span>;
                case "boolean":
                    return <span class="hl-Boolean">{arg}</span>;
                case "function":
                    return <span class="hl-Function">{arg}</span>;
                    return <span class="hl-Function">{String(arg).replace(/\{(.|\n)*/, "{ ... }")}</span>; /* } vim */
                case "undefined":
                    return <span class="hl-Null">{arg}</span>;
                case "object":
                    // for java packages value.toString() would crash so badly
                    // that we cannot even try/catch it
                    if (/^\[JavaPackage.*\]$/.test(arg))
                        return <>[JavaPackage]</>;
                    return <>{arg}</>;
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
        let lcstr = str.toLowerCase();
        let lcfilter = filter.toLowerCase();
        let s = <></>;
        let start = 0;
        let i;
        while ((i = lca.indexOf(lcfilter, start)) > -1)
        {
            s += <>{str.substring(start, i)}</>;
            s += <span style="font-weight: bold">{str.substr(i, filter.length)}</span>;
            start = i + filter.length;
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
        return <>:{liberator.commandline.getCommand()}<br/></> + xml;
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
                        <td>{liberator.util.clip(item.title, 50)}</td>
                        <td style="width: 100%">
                            <a href="#" class="hl-URL">{item.url}</a>&#160;
                            {
                                !(item.extra && item.extra.length) ? "" :
                                <span class="extra-info">
                                    ({
                                        liberator.template.map(item.extra, function (e)
                                        <>{e[0]}: <span class={e[2]}>{e[1]}</span></>,
                                        <![CDATA[ ]]>/* Non-breaking space */)
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
                    this.map2(elems, function (idx, val)
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
                       <td>{liberator.template.maybeXML(datum[1])}</td>
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
                        liberator.template.map2(row, function (i, d)
                        <td style={style[i] || ""}>{d}</td>)
                    }
                    </tr>)
                }
            </table>);
    },
};

