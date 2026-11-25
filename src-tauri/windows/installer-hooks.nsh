; Preserve custom paths on the first silent upgrade across the publisher rename.
!macro NSIS_HOOK_PREINSTALL
  ${If} ${Silent}
  ${AndIf} $INSTDIR == "$LOCALAPPDATA\${PRODUCTNAME}"
    ReadRegStr $0 SHCTX "${MANUPRODUCTKEY}" ""
    ${If} $0 == ""
      ReadRegStr $0 SHCTX "Software\seistem\${PRODUCTNAME}" ""
      ${If} $0 != ""
      ${AndIf} ${FileExists} "$0\uninstall.exe"
        StrCpy $INSTDIR $0
        SetOutPath "$INSTDIR"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
