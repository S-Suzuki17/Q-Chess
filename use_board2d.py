import sys
import re

for filepath in ['src/components/LocalGameBoard.tsx', 'src/components/OnlineGameBoard.tsx']:
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    # Add import for Board2D
    text = text.replace("import { Board3D } from './Board3D';", "import { Board3D } from './Board3D';\nimport { Board2D } from './Board2D';")

    # Replace <Board3D ... /> with {is2DView ? <Board2D ... /> : <Board3D ... />}
    # We can just match the entire <Board3D block up to />
    match = re.search(r'<Board3D[^>]*?is2DView=\{is2DView\}[^>]*?/>', text, re.DOTALL)
    if match:
        b3d = match.group(0)
        # Remove is2DView={is2DView} from Board3D because it's no longer needed inside Board3D
        b3d_clean = b3d.replace(" is2DView={is2DView}", "")
        
        # Create equivalent Board2D call
        # Board2D has same props but we need to map them properly
        b2d = b3d_clean.replace("<Board3D", "<Board2D")
        
        # Wrap
        replacement = f"{{is2DView ? (\n                    {b2d}\n                ) : (\n                    {b3d_clean}\n                )}}"
        text = text.replace(b3d, replacement)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)

print("Swapped Board3D with Board2D for 2D view")
