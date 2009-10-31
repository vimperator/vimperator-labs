<!DOCTYPE document SYSTEM "chrome://liberator/content/liberator.dtd">

<!-- Header {{{1 -->
<xsl:stylesheet version="1.0"
    xmlns="http://vimperator.org/namespaces/liberator"
    xmlns:liberator="http://vimperator.org/namespaces/liberator"
    xmlns:html="http://www.w3.org/1999/xhtml"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:str="http://exslt.org/strings"
    xmlns:exsl="http://exslt.org/common"
    extension-element-prefixes="str">

    <xsl:output method="xml" indent="no"/>

    <!-- Variable Definitions {{{1 -->

    <xsl:variable name="tags">
        <xsl:text> </xsl:text>
        <xsl:for-each select="//@tag|//liberator:tags/text()|//liberator:tag/text()">
            <xsl:value-of select="concat(., ' ')"/>
        </xsl:for-each>
    </xsl:variable>

    <!-- Root {{{1 -->

    <xsl:template match="liberator:document">
        <html:html liberator:highlight="Help">
            <html:head>
                <html:title><xsl:value-of select="@title"/></html:title>
                <html:base href="liberator://help/{@name}"/>
                <html:script type="text/javascript"
                    src="chrome://liberator/content/help.js"/>
            </html:head>
            <html:body liberator:highlight="HelpBody">
                <html:div class="liberator-logo"/>
                <xsl:call-template name="parse-tags">
                    <xsl:with-param name="text" select="concat(@name, '.html')"/>
                </xsl:call-template>
                <xsl:apply-templates/>
            </html:body>
        </html:html>
    </xsl:template>

    <!-- Table of Contents {{{1 -->

    <xsl:template name="toc">
        <xsl:param name="level"/>
        <xsl:param name="context"/>

        <xsl:variable name="tag" select="concat('h', $level)"/>
        <xsl:variable name="lasttag" select="concat('h', $level - 1)"/>

        <xsl:variable name="nodes" select="//liberator:*[
            local-name() = $tag and preceding::*[local-name() = $lasttag][position() = 1 and . = $context]]"/>

        <xsl:if test="$nodes">
            <html:ol liberator:highlight="HelpOrderedList">
                <xsl:for-each select="$nodes">
                    <li>
                        <html:a>
                            <xsl:if test="@tag">
                                <xsl:attribute name="href"><xsl:value-of select="concat('#', substring-before(concat(@tag, ' '), ' '))"/></xsl:attribute>
                            </xsl:if>
                            <xsl:apply-templates select="node()"/>
                        </html:a>
                        <xsl:call-template name="toc">
                            <xsl:with-param name="level" select="$level + 1"/>
                            <xsl:with-param name="context" select="."/>
                        </xsl:call-template>
                    </li>
                </xsl:for-each>
            </html:ol>
        </xsl:if>
    </xsl:template>
    <xsl:template match="liberator:h1" mode="pass-2">
        <xsl:copy>
            <xsl:apply-templates select="@*|node()"/>
        </xsl:copy>
        <html:div liberator:highlight="HelpTOC">
            <h2>Contents</h2>
            <xsl:call-template name="toc">
                <xsl:with-param name="level" select="2"/>
                <xsl:with-param name="context" select="."/>
            </xsl:call-template>
        </html:div>
    </xsl:template>

    <!-- Items {{{1 -->

    <xsl:template match="liberator:item" mode="pass-2">
        <xsl:copy>
            <xsl:apply-templates select="liberator:tags|liberator:spec"/>
            <html:hr style="border: 0; height: 0; margin: 0; width: 100%; float: right;"/>
            <html:div liberator:highlight="HelpOptInfo">
                <xsl:apply-templates select="liberator:type|liberator:default"/>
                <html:div style="clear: both;"/>
            </html:div>
            <xsl:apply-templates select="liberator:description"/>
            <html:div style="clear: both;"/>
        </xsl:copy>
    </xsl:template>
    <xsl:template match="liberator:spec[preceding-sibling::liberator:spec]" mode="pass-2">
        <html:div style="clear: both;"/>
        <xsl:copy>
            <xsl:apply-templates/>
        </xsl:copy>
    </xsl:template>

    <xsl:template match="liberator:default[not(@type='plain')]" mode="pass-2">
        <xsl:variable name="type" select="preceding-sibling::liberator:type[1] | following-sibling::liberator:type[1]"/>
        <xsl:copy>
            <xsl:choose>
                <xsl:when test="starts-with($type, 'string')">
                    <str><xsl:apply-templates/></str>
                </xsl:when>
                <xsl:otherwise>
                    <span>
                        <xsl:attribute name="highlight" namespace="http://vimperator.org/namespaces/liberator">
                            <xsl:choose>
                                <xsl:when test="$type = 'boolean'">Boolean</xsl:when>
                                <xsl:when test="$type = 'number'">Number</xsl:when>
                                <xsl:when test="$type = 'charlist'">String</xsl:when>
                            </xsl:choose>
                        </xsl:attribute>
                        <xsl:apply-templates/>
                    </span>
                </xsl:otherwise>
            </xsl:choose>
        </xsl:copy>
    </xsl:template>

    <!-- Tag Definitions {{{1 -->

    <xsl:template match="liberator:tags" mode="pass-2">
        <html:div style="clear: right"/>
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
        <tags>
        <xsl:for-each select="str:tokenize($text)">
            <html:a id="{.}"><tag><xsl:value-of select="."/></tag></html:a>
        </xsl:for-each>
        </tags>
    </xsl:template>

    <!-- Tag Links {{{1 -->

    <xsl:template name="linkify-tag">
        <xsl:param name="contents"/>
        <xsl:variable name="tag" select="str:tokenize($contents, ' [')[1]"/>
        <html:a href="liberator://help-tag/{$tag}" style="color: inherit;">
            <xsl:if test="contains($tags, concat(' ', $tag, ' '))">
                <xsl:attribute name="href">#<xsl:value-of select="$tag"/></xsl:attribute>
            </xsl:if>
            <xsl:value-of select="$contents"/>
        </html:a>
    </xsl:template>

    <xsl:template match="liberator:o" mode="pass-2">
        <xsl:copy>
            <xsl:call-template name="linkify-tag">
                <xsl:with-param name="contents" select='concat("&#39;", text(), "&#39;")'/>
            </xsl:call-template>
        </xsl:copy>
    </xsl:template>
    <xsl:template match="liberator:k|liberator:t" mode="pass-2">
        <xsl:copy>
            <xsl:call-template name="linkify-tag">
                <xsl:with-param name="contents" select="text()"/>
            </xsl:call-template>
        </xsl:copy>
    </xsl:template>
    <xsl:template match="liberator:k[@name]" mode="pass-2">
        <xsl:copy>
            <xsl:call-template name="linkify-tag">
                <xsl:with-param name="contents" select="concat('&lt;', @name, '>', .)"/>
            </xsl:call-template>
        </xsl:copy>
    </xsl:template>

    <!-- HTML-ish elements {{{1 -->

    <xsl:template match="liberator:ul" mode="pass-2">
        <html:ul liberator:highlight="HelpList"><xsl:apply-templates select="@*|node()"/></html:ul>
    </xsl:template>
    <xsl:template match="liberator:ol" mode="pass-2">
        <html:ol liberator:highlight="HelpOrderedList"><xsl:apply-templates select="@*|node()"/></html:ol>
    </xsl:template>
    <xsl:template match="liberator:ex" mode="pass-2">
        <xsl:copy>
            <xsl:call-template name="linkify-tag">
                <xsl:with-param name="contents" select="."/>
            </xsl:call-template>
        </xsl:copy>
    </xsl:template>

    <xsl:template match="liberator:dl" mode="pass-2">
        <xsl:copy>
            <column/>
            <column/>
            <xsl:for-each select="liberator:dt">
                <tr>
                    <xsl:apply-templates select="."/>
                    <xsl:apply-templates select="following-sibling::liberator:dd[position()=1]"/>
                </tr>
            </xsl:for-each>
        </xsl:copy>
    </xsl:template>

    <xsl:template match="liberator:link" mode="pass-2">
        <html:a href="{@topic}"><xsl:apply-templates select="@*|node()"/></html:a>
    </xsl:template>

    <!-- Special Element Templates {{{1 -->

    <xsl:template match="liberator:pan[liberator:handle]">
        <form style="text-align:center" xmlns="http://www.w3.org/1999/xhtml"
              action="https://www.paypal.com/cgi-bin/webscr" method="post">
            <input type="hidden" name="cmd" value="_s-xclick"/>
            <input type="image" src="chrome://liberator/content/x-click-but21.png" border="0" name="submit" alt="Donate with PayPal"/>
            <input type="hidden" name="encrypted" value="-----BEGIN PKCS7-----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-----END PKCS7-----
                "/>
        </form>
    </xsl:template>

    <!-- Process Inclusions {{{1 -->

    <xsl:template match="liberator:include" mode="pass-2">
        <xsl:apply-templates select="document(@href)/liberator:document/node()"/>
    </xsl:template>

    <!-- Process Overlays {{{1 -->

    <xsl:variable name="overlay" select="concat('liberator://help-overlay/', /liberator:document/@name)"/>
    <xsl:variable name="overlaydoc" select="document($overlay)/liberator:overlay"/>

    <xsl:template name="splice-overlays">
        <xsl:param name="elem"/>
        <xsl:param name="tag"/>
        <xsl:for-each select="$overlaydoc/*[@insertbefore=$tag]">
            <xsl:apply-templates select="."/>
        </xsl:for-each>
        <xsl:choose>
            <xsl:when test="$overlaydoc/*[@replace=$tag] and not($elem[@replace])">
                <xsl:for-each select="$overlaydoc/*[@replace=$tag]">
                    <xsl:apply-templates select="." mode="pass-2"/>
                </xsl:for-each>
            </xsl:when>
            <xsl:otherwise>
                <xsl:for-each select="$elem">
                    <xsl:apply-templates select="." mode="pass-2"/>
                </xsl:for-each>
            </xsl:otherwise>
        </xsl:choose>
        <xsl:for-each select="$overlaydoc/*[@insertafter=$tag]">
            <xsl:apply-templates select="."/>
        </xsl:for-each>
    </xsl:template>

    <xsl:template match="liberator:document/liberator:tags|liberator:document/liberator:tag">
        <xsl:call-template name="splice-overlays">
            <xsl:with-param name="tag" select="substring-before(concat(., ' '), ' ')"/>
            <xsl:with-param name="elem" select="self::node()"/>
        </xsl:call-template>
    </xsl:template>
    <xsl:template match="liberator:document/*[liberator:tags]">
        <xsl:call-template name="splice-overlays">
            <xsl:with-param name="tag" select="substring-before(concat(liberator:tags, ' '), ' ')"/>
            <xsl:with-param name="elem" select="self::node()"/>
        </xsl:call-template>
    </xsl:template>
    <xsl:template match="liberator:*[@tag and not(@replace)]">
        <xsl:call-template name="splice-overlays">
            <xsl:with-param name="tag" select="substring-before(concat(@tag, ' '), ' ')"/>
            <xsl:with-param name="elem" select="self::node()"/>
        </xsl:call-template>
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
