$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=EconNotes Platform, O=EconNotes Inc., C=TR" -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(5)
Set-AuthenticodeSignature -FilePath "public\downloads\EconNotes-Kurulum.exe" -Certificate $cert
Set-AuthenticodeSignature -FilePath "public\downloads\EconNotes-Setup.exe" -Certificate $cert
Write-Host "Authenticode Signature applied successfully!"
