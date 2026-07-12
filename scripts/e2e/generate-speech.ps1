[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$OutputPath)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voice.SetOutputToWaveFile($OutputPath)
  $voice.Speak("Prism verifies local transcription without a cloud service.")
} finally {
  $voice.Dispose()
}
