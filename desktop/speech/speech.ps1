$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
    Add-Type -AssemblyName System.Speech
    if ($env:INTERCOM_SPEECH_MODE -in @('speak', 'voices', 'render')) {
        $synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
        $rendered = $null
        try {
            $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled })
            if ($env:INTERCOM_SPEECH_MODE -eq 'voices') {
                $catalog = @($voices | ForEach-Object {
                    @{id = $_.VoiceInfo.Name; gender = $_.VoiceInfo.Gender.ToString(); culture = $_.VoiceInfo.Culture.Name}
                })
                ConvertTo-Json -InputObject $catalog -Compress
                return
            }
            $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
            if (-not ($request.text -is [string]) -or -not $request.text.Trim() -or $request.text.Length -gt 4500) { throw 'Invalid spoken response.' }
            if ($null -eq $request.voiceId) {
                $voice = $voices | Where-Object { $_.VoiceInfo.Culture.Name -like 'en-*' } | Select-Object -First 1
                if (-not $voice) { throw 'No installed local English speaking voice is available.' }
            } else {
                $voice = $voices | Where-Object { $_.VoiceInfo.Name -ceq $request.voiceId } | Select-Object -First 1
                if (-not $voice) { throw 'The selected speaking voice is unavailable. Choose an installed voice; no replacement was used.' }
            }
            foreach ($key in @('rate', 'pitch', 'volume')) {
                if ($request.$key -isnot [int] -and $request.$key -isnot [long]) { throw 'Invalid voice controls.' }
            }
            if ($request.rate -lt -10 -or $request.rate -gt 10 -or $request.pitch -lt -12 -or $request.pitch -gt 12 -or $request.volume -lt 0 -or $request.volume -gt 100) { throw 'Voice controls exceed the supported range.' }
            $synth.SelectVoice($voice.VoiceInfo.Name)
            $synth.Rate = $request.rate
            $synth.Volume = $request.volume
            if ($env:INTERCOM_SPEECH_MODE -eq 'render') {
                $rendered = [System.IO.MemoryStream]::new()
                $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
                $synth.SetOutputToAudioStream($rendered, $format)
            }
            $text = [System.Security.SecurityElement]::Escape($request.text)
            $culture = [System.Security.SecurityElement]::Escape($voice.VoiceInfo.Culture.Name)
            $pitch = $request.pitch.ToString('+0;-0;0', [System.Globalization.CultureInfo]::InvariantCulture) + 'st'
            $synth.SpeakSsml('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="' + $culture + '"><prosody pitch="' + $pitch + '">' + $text + '</prosody></speak>')
            if ($rendered) { @{pcm = [Convert]::ToBase64String($rendered.ToArray()); sampleRate = 16000} | ConvertTo-Json -Compress }
        } finally {
            $synth.Dispose()
            if ($rendered) { $rendered.Dispose() }
        }
    } elseif ($env:INTERCOM_SPEECH_MODE -eq 'recognize') {
        $info = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
            Where-Object { $_.Culture.Name -eq 'en-US' } | Select-Object -First 1
        if (-not $info) { throw 'Install Windows English (United States) speech recognition before recording.' }
        $engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($info)
        $wave = [System.IO.MemoryStream]::new()
        $phraseSubscription = $null
        $completedSubscription = $null
        try {
            [Console]::OpenStandardInput().CopyTo($wave)
            $wave.Position = 24
            $reader = [System.IO.BinaryReader]::new($wave, [System.Text.Encoding]::UTF8, $true)
            try { $sampleRate = $reader.ReadUInt32() }
            finally { $reader.Dispose() }
            $seconds = ($wave.Length - 44) / ($sampleRate * 2)
            $wave.Position = 0
            $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
            $engine.SetInputToWaveStream($wave)
            $parts = @()
            $confidence = 1.0
            $phraseSubscription = Register-ObjectEvent $engine SpeechRecognized -SourceIdentifier IntercomPhrase
            $completedSubscription = Register-ObjectEvent $engine RecognizeCompleted -SourceIdentifier IntercomCompleted
            $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
            $deadline = [DateTime]::UtcNow.AddSeconds([Math]::Max(40, $seconds * 3))
            $completed = $false
            while (-not $completed) {
                $event = Wait-Event -Timeout 1
                if ($event) {
                    if ($event.SourceIdentifier -eq 'IntercomPhrase') {
                        $result = $event.SourceEventArgs.Result
                        $parts += $result.Text
                        $confidence = [Math]::Min($confidence, $result.Confidence)
                    } elseif ($event.SourceIdentifier -eq 'IntercomCompleted') {
                        if ($event.SourceEventArgs.Error) { throw $event.SourceEventArgs.Error }
                        if ($event.SourceEventArgs.Cancelled) { throw 'Recognition was cancelled.' }
                        $completed = $true
                    }
                    Remove-Event -EventIdentifier $event.EventIdentifier
                }
                if ([DateTime]::UtcNow -gt $deadline) { throw 'Local speech recognition timed out. Nothing was sent.' }
            }
            if (-not $parts.Count) { throw 'No English speech was recognized. Check the input meter and try a short English sentence.' }
            @{text = ($parts -join ' '); confidence = $confidence} | ConvertTo-Json -Compress
        } finally {
            $engine.Dispose()
            if ($phraseSubscription) { Unregister-Event -SubscriptionId $phraseSubscription.SubscriptionId }
            if ($completedSubscription) { Unregister-Event -SubscriptionId $completedSubscription.SubscriptionId }
            $wave.Dispose()
        }
    } else { throw 'Unsupported speech operation.' }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
