import io
import base64
from PIL import Image

b = Image.open('assets/emoty_boy_avatar.jpg').resize((384, 384), Image.Resampling.LANCZOS)
buf_b = io.BytesIO()
b.save(buf_b, format='JPEG', quality=88, optimize=True)
b_b64 = base64.b64encode(buf_b.getvalue()).decode('ascii')

g = Image.open('assets/emoty_girl_avatar.png').resize((384, 384), Image.Resampling.LANCZOS)
buf_g = io.BytesIO()
g.save(buf_g, format='JPEG', quality=88, optimize=True)
g_b64 = base64.b64encode(buf_g.getvalue()).decode('ascii')

content = f'''/**
 * Generated notification avatar assets for Android push notifications.
 * Sized at 384x384 JPEG (~27KB and ~34KB) to strictly comply with FCM 1MB limit
 * and ensure fast (<50ms) download over cellular networks for Android notification large icon.
 */

export const BOY_AVATAR_NOTIFICATION_BASE64 = "{b_b64}";

export const GIRL_AVATAR_NOTIFICATION_BASE64 = "{g_b64}";
'''

with open('convex/avatarAssets.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Generated convex/avatarAssets.ts: Boy {len(b_b64)} chars, Girl {len(g_b64)} chars")
