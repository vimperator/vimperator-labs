#!/bin/sh
set -e

top=$(pwd)
jar=$1
bases=$2
dirs=$3
text=$4
bin=$5
shift 5;
files="$@"

stage="$top/${jar%.*}"
mkdir -p $stage

getfiles () {
    filter="\.($(echo $1 | tr ' ' '|'))$"; shift
    find "$@" -not -path '*CVS*' 2>/dev/null | grep -E "$filter" || true
}
copytext () {
    sed -e "s,###VERSION###,$VERSION,g" \
        -e "s,###DATE###,$DATE,g" \
        <"$1" >"$2"
    cmp -s "$1" "$2" ||
    ( echo "modified: $1"; diff -u "$1" "$2" | grep '^[-+][^-+]' )
}

for base in $bases
do
    (
        set -e
        cd $base
        [ ${jar##*.} = jar ] && stage="$stage/${base##*/}"
        for dir in $dirs
        do
            for f in $(getfiles "$bin" "$dir")
            do
                mkdir -p "$stage/${f%/*}"
                cp $f "$stage/$f"
            done
            for f in $(getfiles "$text" "$dir")
            do
                mkdir -p "$stage/${f%/*}"
                copytext "$f" "$stage/$f"
            done
        done
        for f in $files
        do
            [ -f "$f" ] && copytext "$f" "$stage/$f"
        done
	true
    ) || exit 1
done

(cd $stage; zip -r "$top/$jar" *) || exit 1
rm -rf "$stage"

