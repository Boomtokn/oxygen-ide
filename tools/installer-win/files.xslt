<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:wix='http://schemas.microsoft.com/wix/2006/wi'
    xmlns:fire='http://schemas.microsoft.com/wix/FirewallExtension'
    xmlns='http://schemas.microsoft.com/wix/2006/wi'
    exclude-result-prefixes='wix'>
    <xsl:output method="xml" indent="yes" />

    <xsl:template match="wix:File[@Source='SourceDir\oxygenide.exe']">
        <wix:File>
            <xsl:copy-of select="@*" />
            <fire:FirewallException Id='oxygenide.exe' Name='Oxygen IDE' IgnoreFailure='yes' Scope="localSubnet" />
            <xsl:apply-templates select="node()" />
        </wix:File>
    </xsl:template>

    <xsl:template match="@*|node()">
        <xsl:copy>
            <xsl:apply-templates select="@*|node()" />
        </xsl:copy>
    </xsl:template>

    <xsl:template match="/">
        <xsl:comment>!!!THIS FILE IS AUTOMATICALLY GENERATED. DO NOT EDIT!!!</xsl:comment>
        <xsl:apply-templates />
    </xsl:template>
</xsl:stylesheet> 