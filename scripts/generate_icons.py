"""Export the app's simple vector shield as committed launcher PNGs (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / 'mobile' / 'assets'
points = [(512,220),(782,330),(766,600),(690,730),(512,832),(334,730),(258,600),(242,330)]
scale = 3
foreground = Image.new('RGBA', (1024*scale,1024*scale))
draw = ImageDraw.Draw(foreground)
draw.polygon([(x*scale,y*scale) for x,y in points], fill='white')
draw.rounded_rectangle((480*scale,390*scale,544*scale,580*scale), radius=22*scale, fill=(0,0,0,0))
draw.ellipse((478*scale,630*scale,546*scale,698*scale), fill=(0,0,0,0))
foreground = foreground.resize((1024,1024), Image.Resampling.LANCZOS)
background = Image.new('RGB', (1024,1024), '#ad273b')
background.paste(foreground, mask=foreground.getchannel('A'))
background.save(root / 'icon.png')
foreground.save(root / 'android-icon-foreground.png')
foreground.save(root / 'android-icon-monochrome.png')
Image.new('RGB',(1024,1024),'#ad273b').save(root / 'android-icon-background.png')
foreground.save(root / 'splash-icon.png')
background.resize((64,64),Image.Resampling.LANCZOS).save(root / 'favicon.png')
(root / 'icon-source.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#ad273b"/><defs><mask id="mark"><rect width="1024" height="1024" fill="black"/><polygon points="512,220 782,330 766,600 690,730 512,832 334,730 258,600 242,330" fill="white"/><rect x="480" y="390" width="64" height="190" rx="22" fill="black"/><circle cx="512" cy="664" r="34" fill="black"/></mask></defs><rect width="1024" height="1024" fill="white" mask="url(#mark)"/></svg>\n''')
print('Exported opaque iOS/Android icon and transparent adaptive/themed icon assets.')
