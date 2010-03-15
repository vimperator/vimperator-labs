<!DOCTYPE document SYSTEM "chrome://liberator/content/liberator.dtd">

<!-- Header {{{1 -->
<xsl:stylesheet version="1.0"
    xmlns="http://www.w3.org/1999/xhtml"
    xmlns:html="http://www.w3.org/1999/xhtml"
    xmlns:liberator="http://vimperator.org/namespaces/liberator"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:str="http://exslt.org/strings"
    xmlns:exsl="http://exslt.org/common"
    extension-element-prefixes="exsl str">

    <xsl:output method="xml" indent="no"/>

    <!-- Variable Definitions {{{1 -->

    <xsl:variable name="doc">
        <xsl:apply-templates select="/liberator:document" mode="overlay"/>
    </xsl:variable>
    <xsl:variable name="root" select="exsl:node-set($doc)"/>

    <xsl:variable name="tags">
        <xsl:text> </xsl:text>
        <xsl:for-each select="$root//@tag|$root//liberator:tags/text()|$root//liberator:tag/text()">
            <xsl:value-of select="concat(., ' ')"/>
        </xsl:for-each>
    </xsl:variable>

    <!-- Process Overlays {{{1 -->

    <xsl:variable name="overlay" select="concat('liberator://help-overlay/', /liberator:document/@name)"/>
    <xsl:variable name="overlaydoc" select="document($overlay)/liberator:overlay"/>

    <xsl:template name="splice-overlays">
        <xsl:param name="elem"/>
        <xsl:param name="tag"/>
        <xsl:for-each select="$overlaydoc/*[@insertbefore=$tag]">
            <xsl:apply-templates select="." mode="overlay"/>
        </xsl:for-each>
        <xsl:choose>
            <xsl:when test="$overlaydoc/*[@replace=$tag] and not($elem[@replace])">
                <xsl:for-each select="$overlaydoc/*[@replace=$tag]">
                    <xsl:apply-templates select="." mode="overlay-2"/>
                </xsl:for-each>
            </xsl:when>
            <xsl:otherwise>
                <xsl:for-each select="$elem">
                    <xsl:apply-templates select="." mode="overlay-2"/>
                </xsl:for-each>
            </xsl:otherwise>
        </xsl:choose>
        <xsl:for-each select="$overlaydoc/*[@insertafter=$tag]">
            <xsl:apply-templates select="." mode="overlay"/>
        </xsl:for-each>
    </xsl:template>

    <xsl:template match="liberator:tags[parent::liberator:document]|liberator:tag" mode="overlay">
        <xsl:call-template name="splice-overlays">
            <xsl:with-param name="tag" select="substring-before(concat(., ' '), ' ')"/>
            <xsl:with-param name="elem" select="self::node()"/>
        </xsl:call-template>
    </xsl:template>
    <xsl:template match="*[liberator:tags]" mode="overlay">
        <xsl:call-template name="splice-overlays">
            <xsl:with-param name="tag" select="substring-before(concat(liberator:tags, ' '), ' ')"/>
            <xsl:with-param name="elem" select="self::node()"/>
        </xsl:call-template>
    </xsl:template>
    <xsl:template match="liberator:*[@tag and not(@replace)]" mode="overlay">
        <xsl:call-template name="splice-overlays">
            <xsl:with-param name="tag" select="substring-before(concat(@tag, ' '), ' ')"/>
            <xsl:with-param name="elem" select="self::node()"/>
        </xsl:call-template>
    </xsl:template>

    <!-- Process Inclusions {{{1 -->

    <xsl:template match="liberator:include" mode="overlay-2">
        <div liberator:highlight="HelpInclude">
            <xsl:apply-templates select="document(@href)/liberator:document/node()" mode="overlay"/>
        </div>
    </xsl:template>

    <xsl:template match="@*|node()" mode="overlay">
        <xsl:apply-templates select="." mode="overlay-2"/>
    </xsl:template>
    <xsl:template match="@*|node()" mode="overlay-2">
        <xsl:copy>
            <xsl:apply-templates select="@*|node()" mode="overlay"/>
        </xsl:copy>
    </xsl:template>

    <!-- Root {{{1 -->

    <xsl:template match="/">
        <xsl:for-each select="$root/liberator:document">
            <html liberator:highlight="Help">
                <head>
                    <title><xsl:value-of select="@title"/></title>
                    <script type="text/javascript"
                        src="chrome://liberator/content/help.js"/>
                </head>
                <body liberator:highlight="HelpBody">
                    <div liberator:highlight="Logo"/>
                    <xsl:call-template name="parse-tags">
                        <xsl:with-param name="text" select="concat(@name, '.html')"/>
                    </xsl:call-template>
                    <xsl:apply-templates/>
                </body>
            </html>
        </xsl:for-each>
    </xsl:template>

    <!-- Table of Contents {{{1 -->

    <xsl:template name="toc">
        <xsl:param name="level" select="1"/>
        <xsl:param name="context"/>
        <xsl:param name="toc"/>

        <xsl:variable name="tag" select="concat('h', $level)"/>
        <xsl:variable name="lasttag" select="concat('h', $level - 1)"/>

        <xsl:variable name="nodes" select="$toc/*[
            local-name() = $tag and not(preceding::*[local-name() = $lasttag][position() = 1 and not(.=$context)])]"/>

        <xsl:if test="$nodes">
            <ol liberator:highlight="HelpOrderedList">
                <xsl:for-each select="$nodes">
                    <li>
                        <a>
                            <xsl:if test="@tag">
                                <xsl:attribute name="href"><xsl:value-of select="concat('#', substring-before(concat(@tag, ' '), ' '))"/></xsl:attribute>
                            </xsl:if>
                            <xsl:apply-templates select="node()"/>
                        </a>
                        <xsl:call-template name="toc">
                            <xsl:with-param name="level" select="$level + 1"/>
                            <xsl:with-param name="context" select="."/>
                            <xsl:with-param name="toc" select="$toc"/>
                        </xsl:call-template>
                    </li>
                </xsl:for-each>
            </ol>
        </xsl:if>
    </xsl:template>
    <xsl:template match="liberator:toc" mode="pass-2">
        <xsl:variable name="TOC">
            <context/>
            <xsl:for-each
                select="following::liberator:h1|following::liberator:h2|following::liberator:h3|following::liberator:h4|following::liberator:h5">
                <xsl:copy-of select="."/>
            </xsl:for-each>
        </xsl:variable>
        <xsl:variable name="toc" select="exsl:node-set($TOC)"/>

        <xsl:if test="//liberator:toc[1 and self::*]">
            <div liberator:highlight="HelpTOC">
                <h2>Contents</h2>
                <xsl:if test="@start">
                    <xsl:call-template name="toc">
                        <xsl:with-param name="level" select="number(@start)"/>
                        <xsl:with-param name="toc" select="$toc"/>
                    </xsl:call-template>
                </xsl:if>
                <xsl:if test="not(@start)">
                    <xsl:call-template name="toc">
                        <xsl:with-param name="toc" select="$toc"/>
                    </xsl:call-template>
                </xsl:if>
            </div>
        </xsl:if>
    </xsl:template>

    <!-- Items {{{1 -->

    <xsl:template match="liberator:strut" mode="pass-2">
        <div style="clear: both"/>
    </xsl:template>
    <xsl:template match="liberator:item" mode="pass-2">
        <div liberator:highlight="HelpItem">
            <xsl:apply-templates select="liberator:tags|liberator:spec|liberator:strut"/>
            <xsl:if test="not(liberator:description/@short)">
                <hr style="border: 0; height: 0; margin: 0; width: 100%; float: right;"/>
                <div liberator:highlight="HelpOptInfo">
                    <xsl:apply-templates select="liberator:type|liberator:default"/>
                    <div style="clear: both;"/>
                </div>
            </xsl:if>
            <xsl:apply-templates select="liberator:description"/>
            <div style="clear: both;"/>
        </div>
    </xsl:template>
    <xsl:template match="liberator:spec[preceding-sibling::liberator:spec]" mode="pass-2">
        <div style="clear: both;"/>
        <div liberator:highlight="HelpSpec">
            <xsl:apply-templates/>
        </div>
    </xsl:template>

    <xsl:template match="liberator:default[not(@type='plain')]" mode="pass-2">
        <xsl:variable name="type" select="preceding-sibling::liberator:type[1] | following-sibling::liberator:type[1]"/>
        <span liberator:highlight="HelpDefault">(default:<xsl:text> </xsl:text>
            <xsl:choose>
                <xsl:when test="starts-with($type, 'string')">
                    <span liberator:highlight="HelpString"><xsl:apply-templates/></span>
                </xsl:when>
                <xsl:otherwise>
                    <span>
                        <xsl:attribute name="liberator:highlight">
                            <xsl:choose>
                                <xsl:when test="$type = 'boolean'">Boolean</xsl:when>
                                <xsl:when test="$type = 'number'">Number</xsl:when>
                                <xsl:when test="$type = 'charlist'">String</xsl:when>
                            </xsl:choose>
                        </xsl:attribute>
                        <xsl:apply-templates/>
                    </span>
                </xsl:otherwise>
            </xsl:choose>)
        </span>
    </xsl:template>

    <!-- Tag Definitions {{{1 -->

    <xsl:template match="liberator:tags" mode="pass-2">
        <div style="clear: right"/>
        <xsl:call-template name="parse-tags">
            <xsl:with-param name="text" select="."/>
        </xsl:call-template>
    </xsl:template>
    <xsl:template match="liberator:tag|@tag" mode="pass-2">
        <xsl:call-template name="parse-tags">
            <xsl:with-param name="text" select="."/>
        </xsl:call-template>
    </xsl:template>
    <xsl:template name="parse-tags">
        <xsl:param name="text"/>
        <div liberator:highlight="HelpTags">
        <xsl:for-each select="str:tokenize($text)">
            <a id="{.}" liberator:highlight="HelpTag"><xsl:value-of select="."/></a>
        </xsl:for-each>
        </div>
    </xsl:template>

    <!-- Tag Links {{{1 -->

    <xsl:template name="linkify-tag">
        <xsl:param name="contents" select="text()"/>
        <xsl:variable name="tag" select="str:tokenize($contents, ' [!')[1]"/>
        <a href="liberator://help-tag/{$tag}" style="color: inherit;">
            <xsl:if test="contains($tags, concat(' ', $tag, ' '))">
                <xsl:attribute name="href">#<xsl:value-of select="$tag"/></xsl:attribute>
            </xsl:if>
            <xsl:value-of select="$contents"/>
        </a>
    </xsl:template>

    <xsl:template match="liberator:o" mode="pass-2">
        <span liberator:highlight="HelpOption">
            <xsl:call-template name="linkify-tag">
                <xsl:with-param name="contents" select='concat("&#39;", text(), "&#39;")'/>
            </xsl:call-template>
        </span>
    </xsl:template>
    <xsl:template match="liberator:t" mode="pass-2">
        <span liberator:highlight="HelpTopic">
            <xsl:call-template name="linkify-tag"/>
        </span>
    </xsl:template>
    <xsl:template match="liberator:k" mode="pass-2">
        <span liberator:highlight="HelpKey">
            <xsl:call-template name="linkify-tag"/>
        </span>
    </xsl:template>
    <xsl:template match="liberator:k[@name]" mode="pass-2">
        <span liberator:highlight="HelpKey">
            <xsl:call-template name="linkify-tag">
                <xsl:with-param name="contents" select="concat('&lt;', @name, '>', .)"/>
            </xsl:call-template>
        </span>
    </xsl:template>

    <!-- HTML-ish elements {{{1 -->

    <xsl:template match="liberator:dl" mode="pass-2">
        <dl>
            <column/>
            <column/>
            <xsl:for-each select="liberator:dt">
                <tr>
                    <xsl:apply-templates select="."/>
                    <xsl:apply-templates select="following-sibling::liberator:dd[1]"/>
                </tr>
            </xsl:for-each>
        </dl>
    </xsl:template>

    <xsl:template match="liberator:link" mode="pass-2">
        <a href="{@topic}"><xsl:apply-templates select="@*|node()"/></a>
    </xsl:template>

    <xsl:template match="liberator:em | liberator:tt | liberator:p  |
                         liberator:dt | liberator:dd |
                         liberator:ol | liberator:ul | liberator:li |
                         liberator:h1 | liberator:h2 | liberator:h3"
                         mode="pass-2">
        <xsl:element name="html:{local-name()}">
            <xsl:apply-templates select="@*|node()"/>
        </xsl:element>
    </xsl:template>

    <xsl:template match="liberator:code" mode="pass-2">
        <pre liberator:highlight="HelpCode"><xsl:apply-templates select="@*|node()"/></pre>
    </xsl:template>

    <!-- Help elements {{{1 -->

    <xsl:template match="liberator:a" mode="pass-2">
        <span liberator:highlight="HelpArg">{<xsl:apply-templates select="@*|node()"/>}</span>
    </xsl:template>
    <xsl:template match="liberator:oa" mode="pass-2">
        <span liberator:highlight="HelpOptionalArg">[<xsl:apply-templates select="@*|node()"/>]</span>
    </xsl:template>

    <xsl:template match="liberator:note" mode="pass-2">
        <p style="clear: both;">
            <xsl:apply-templates select="@*"/>
            <div style="clear: both;"/>
            <span liberator:highlight="HelpNote">Note:</span>
            <xsl:text> </xsl:text> 
            <xsl:apply-templates select="node()"/>
        </p>
    </xsl:template>
    <xsl:template match="liberator:warning" mode="pass-2">
        <p style="clear: both;">
            <xsl:apply-templates select="@*"/>
            <div style="clear: both;"/>
            <span liberator:highlight="HelpWarning">Warning:</span>
            <xsl:text> </xsl:text> 
            <xsl:apply-templates select="node()"/>
        </p>
    </xsl:template>
    <xsl:template match="liberator:default" mode="pass-2">
        <span liberator:highlight="HelpDefault">
            (default:<xsl:text> </xsl:text><xsl:apply-templates select="@*|node()"/>)
        </span>
    </xsl:template>

    <!-- HTML-ify other elements {{{1 -->

    <xsl:template match="liberator:ex" mode="pass-2">
        <span liberator:highlight="HelpEx">
            <xsl:call-template name="linkify-tag">
                <xsl:with-param name="contents" select="."/>
            </xsl:call-template>
        </span>
    </xsl:template>

    <xsl:template match="liberator:description | liberator:example | liberator:spec" mode="pass-2">
        <div>
            <xsl:if test="self::liberator:description"><xsl:attribute name="liberator:highlight">HelpDescription</xsl:attribute></xsl:if>
            <xsl:if test="self::liberator:example"><xsl:attribute name="liberator:highlight">HelpExample</xsl:attribute></xsl:if>
            <xsl:if test="self::liberator:spec"><xsl:attribute name="liberator:highlight">HelpSpec</xsl:attribute></xsl:if>
            <xsl:apply-templates select="@*|node()"/>
        </div>
    </xsl:template>
    <xsl:template match="liberator:str | liberator:t | liberator:type" mode="pass-2">
        <span>
            <xsl:if test="self::liberator:str"><xsl:attribute name="liberator:highlight">HelpString</xsl:attribute></xsl:if>
            <xsl:if test="self::liberator:t"><xsl:attribute name="liberator:highlight">HelpTopic</xsl:attribute></xsl:if>
            <xsl:if test="self::liberator:type"><xsl:attribute name="liberator:highlight">HelpType</xsl:attribute></xsl:if>
            <xsl:apply-templates select="@*|node()"/>
        </span>
    </xsl:template>

    <!-- Plugins {{{1 -->

    <xsl:template name="info">
        <xsl:param name="label"/>
        <xsl:param name="link" select="@href"/>
        <xsl:param name="nodes" select="node()"/>
        <xsl:param name="extra"/>
        <div liberator:highlight="HelpInfo">
            <div liberator:highlight="HelpInfoLabel">
                <xsl:value-of select="$label"/>:
            </div>
            <span liberator:highlight="HelpInfoValue">
                <a>
                    <xsl:if test="$link">
                        <xsl:attribute name="href"><xsl:value-of select="$link"/></xsl:attribute>
                    </xsl:if>
                    <xsl:copy-of select="exsl:node-set($nodes)"/>
                </a>
                <xsl:copy-of select="exsl:node-set($extra)"/>
            </span>
        </div>
    </xsl:template>
    <xsl:template match="liberator:author[@email]" mode="pass-2">
        <xsl:call-template name="info">
            <xsl:with-param name="label" select="'Author'"/>
            <xsl:with-param name="extra">
                <xsl:text> </xsl:text><a href="mailto:{@email}">✉</a>
            </xsl:with-param>
        </xsl:call-template>
    </xsl:template>
    <xsl:template match="liberator:author" mode="pass-2">
        <xsl:call-template name="info">
            <xsl:with-param name="label" select="'Author'"/>
        </xsl:call-template>
    </xsl:template>
    <xsl:template match="liberator:license" mode="pass-2">
        <xsl:call-template name="info">
            <xsl:with-param name="label" select="'License'"/>
        </xsl:call-template>
    </xsl:template>
    <xsl:template match="liberator:plugin" mode="pass-2">
        <xsl:call-template name="info">
            <xsl:with-param name="label" select="'Plugin'"/>
            <xsl:with-param name="nodes">
                <span><xsl:value-of select="@name"/></span>
            </xsl:with-param>
        </xsl:call-template>
        <xsl:apply-templates/>
    </xsl:template>

    <!-- Special Element Templates {{{1 -->

    <xsl:template match="liberator:logo">
        <span liberator:highlight="Logo"/>
    </xsl:template>

    <xsl:template match="liberator:pan[liberator:handle]">
        <p style="text-align: center">
            <a href="https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&amp;hosted_button_id=8323006" target="_blank">
                <img src="chrome://liberator/content/x-click-but21.png" alt="Donate"/>
            </a>
        </p>
    </xsl:template>

    <!-- Process Tree {{{1 -->

    <xsl:template match="@*|node()" mode="pass-2">
        <xsl:copy>
            <xsl:apply-templates select="@*|node()"/>
        </xsl:copy>
    </xsl:template>
    <xsl:template match="@*|node()">
        <xsl:apply-templates select="." mode="pass-2"/>
    </xsl:template>
</xsl:stylesheet>

<!-- vim:se ft=xslt sts=4 sw=4 et fdm=marker: -->
