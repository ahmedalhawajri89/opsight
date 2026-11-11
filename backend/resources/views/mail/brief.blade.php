{{--
    The morning brief, as email (product track, phase C).

    Inline styles and a single table, because mail clients strip <style> and
    ignore most of CSS. The direction follows the reader: Arabic mail that
    reads left to right puts every full stop at the wrong end.
--}}
<!DOCTYPE html>
<html lang="{{ $locale }}" dir="{{ $rtl ? 'rtl' : 'ltr' }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ $text['subject'] }}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#f4f6f9;font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif;color:#0f1b2d;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3e8ef;border-radius:12px;">
  <tr><td style="padding:24px 24px 8px;text-align:{{ $rtl ? 'right' : 'left' }};">
    <p style="margin:0 0 4px;font-size:13px;color:#5b6b82;">{{ $business }}</p>
    <p style="margin:0 0 16px;font-size:15px;">{{ __('brief.greeting', ['name' => $name]) }}</p>
    <p style="margin:0 0 16px;font-size:17px;line-height:1.6;font-weight:600;">{{ $text['headline'] }}</p>
    @foreach ($text['lines'] as $line)
      <p style="margin:0 0 6px;font-size:14px;line-height:1.6;">{{ $line }}</p>
    @endforeach
    @if ($text['stock'])
      <p style="margin:16px 0 6px;font-size:14px;line-height:1.6;">{{ $text['stock'] }}</p>
    @endif
    @if ($text['actions'] !== [])
      <p style="margin:16px 0 6px;font-size:13px;font-weight:600;color:#5b6b82;">{{ __('brief.actions') }}</p>
      <ul style="margin:0;padding-{{ $rtl ? 'right' : 'left' }}:18px;font-size:14px;line-height:1.7;">
        @foreach ($text['actions'] as $action)
          <li>{{ $action }}</li>
        @endforeach
      </ul>
    @endif
    @if ($quiet)
      <p style="margin:16px 0 0;font-size:14px;color:#5b6b82;">{{ __('brief.quiet') }}</p>
    @endif
  </td></tr>
  <tr><td style="padding:16px 24px 24px;text-align:{{ $rtl ? 'right' : 'left' }};">
    <a href="{{ $url }}" style="display:inline-block;background:#0f2a47;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">{{ __('brief.open') }}</a>
  </td></tr>
</table>
<p style="max-width:560px;margin:12px auto 0;font-size:12px;color:#8592a6;text-align:center;">{{ __('brief.footer') }}</p>
</body>
</html>
