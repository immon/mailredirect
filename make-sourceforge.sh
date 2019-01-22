#!/bin/bash
# sourceforge
DEST=sourceforge
if [ "$(uname)" == "Linux" ]
then
  SRC=$(basename "$(dirname "$(readlink -f "${0}")")")
  cd $(dirname .)/..
else
  SRC=$(basename "$(dirname "$(cygpath -u $(cygpath -m -s "${0}"))")")
  cd $(dirname $(cygpath -u $(cygpath -m -s "${0}")))/..
fi
[ -d xpi ] || mkdir xpi
cd xpi
rm -fr ${DEST}/
rsync -a --exclude-from=../${SRC}/make-exclude.txt ../${SRC}/* ${DEST}/
cd ${DEST}/chrome/locale
for locale in *
do
  if [ "${locale}" != "en-US" ]
  then
    for file in ${locale}/*.*
    do
      echo -n -e "                                        \r${file}"
      if [ "${file##*.}" == "properties" ]
      then
        # Add missing strings as empty string
        diff --suppress-common-lines <(cat ${file} | sed -e "s/=.*$/=/") <(cat en-US/$(basename ${file}) | sed -e "s/=.*$/=/") > ${file}.patch
        patch ${file} ${file}.patch > /dev/null
        rm ${file}.patch

        # Use original string for empty strings
        grep -q '=$' ${file}      # Check if file has untranslated strings
        if [ $? -eq 0 ]
        then
          echo -n -e "\n"
          while read line
          do
            if expr index "${line}" '=' > /dev/null
            then
              untranslatedstring="^${line%%=*}=$"
              untranslatedstring="${untranslatedstring//\{/\\\{}"
              untranslatedstring="${untranslatedstring//\}/\\\}}"
              untranslatedstring="${untranslatedstring//\./\\\.}"
              sed -r "s/${untranslatedstring//\//\\/}/${line//\//\\/}/" ${file} > ${file}.new
              mv ${file}.new ${file}
            fi
          done < en-US/$(basename ${file})
        fi
      fi
      if [ "${file##*.}" == "dtd" ]
      then
        # Add missing strings as empty string
        diff --suppress-common-lines <(cat ${file} | sed -e "s/\".*\"/\"\"/") <(cat en-US/$(basename ${file}) | sed -e "s/\".*\"/\"\"/") > ${file}.patch
        patch ${file} ${file}.patch > /dev/null
        rm ${file}.patch

        # Use original string for empty strings
        grep -q '""' ${file}      # Check if file has untranslated strings
        if [ $? -eq 0 ]
        then
          echo -n -e "\n"
          while read line
          do
            if expr match "${line}" '<!ENTITY' > /dev/null
            then
              untranslatedstring="${line%%\"*}\"\">"
              sed -r "s/${untranslatedstring//\//\\/}/${line//\//\\/}/" ${file} > ${file}.new
              mv ${file}.new ${file}
            fi
          done < en-US/$(basename ${file})
        fi
      fi
    done
  fi
done
echo -n -e "                                        \r"
cd ../..
echo install.rdf > mailredirect.txt
echo manifest.json >> mailredirect.txt
echo chrome.manifest >> mailredirect.txt
find chrome -type f | sort >> mailredirect.txt
echo defaults/ >> mailredirect.txt
echo icon.png >> mailredirect.txt
echo LICENSE >> mailredirect.txt
echo README >> mailredirect.txt
version=$(grep em:version install.rdf | sed -r "s/^[^>]*>//" | sed -r "s/<.*$//")
cp -p manifest.json manifest.tmp
cat manifest.tmp | sed -e "s/\"version\": \".*\"/\"version\": \"${version}\"/" > manifest.json
rm manifest.tmp
rm mailredirect-${version}-sm+tb.xpi 2> /dev/null
zip -r -D -9 mailredirect-${version}-sm+tb.xpi -@ < mailredirect.txt
rm mailredirect.txt
read -p "Press any key to continue . . . " -n 1
