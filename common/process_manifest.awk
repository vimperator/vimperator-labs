{ content = $1 ~ /^(content|skin|locale)$/ }
content && $NF ~ /^[a-z]/ { $NF = "/" name "/" $NF }
content {
    sub(/^\.\./, "", $NF);
    $NF = "jar:chrome/" name ".jar!" $NF
}
{
    sub("^\\.\\./common/", "", $NF)
    print
}

END {
	if (locale){
		printf("locale liberator %s jar:chrome/%s.jar!/common/locale/%s/\n", locale,name,locale);
		printf("locale %s %s jar:chrome/%s.jar!/%s/locale/%s/\n", name, locale, name, name, locale);
	}
}

