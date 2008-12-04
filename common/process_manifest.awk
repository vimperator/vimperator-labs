{ content = $1 ~ /^(content|skin|locale)$/ }
content && $NF ~ /^[a-z]/ { $NF = "/" name "/" $NF }
content {
    sub(/^\.\./, "", $NF);
    $NF = "jar:chrome/" name ".jar!" $NF
}
{
    sub("^\\.\\./liberator/", "", $NF)
    print
}

