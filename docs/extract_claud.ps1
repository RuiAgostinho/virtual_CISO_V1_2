$word = New-Object -ComObject Word.Application
$word.Visible = $false
$docPath = "d:\virtual_ciso\virtual_CISO_V1_2\docs\Relatorio_Rui_Agostinho_08_05_20_Claud.docx"
$outPath = "d:\virtual_ciso\virtual_CISO_V1_2\docs\relatorio_claud_extracted.txt"
$doc = $word.Documents.Open($docPath)
$doc.Content.Text | Out-File -FilePath $outPath -Encoding UTF8
$doc.Close()
$word.Quit()
Write-Host "Done. Output: $outPath"
