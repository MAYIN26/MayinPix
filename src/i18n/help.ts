import type { Lang } from '@/store/studio';

/** Help dialog content. `**text**` renders bold. */
export interface HelpContent {
  title: string;
  sections: { h: string; items?: string[]; p?: string[] }[];
  shortcutsTitle: string;
  shortcuts: [string, string][];
}

export const HELP: Record<Lang, HelpContent> = {
  en: {
    title: 'How MayinPix works',
    sections: [
      {
        h: '1 · Choose a removal mode',
        items: [
          '**AI removal** — an ISNet segmentation model runs in your browser (WebGPU or WebAssembly). It predicts a soft mask at 1024 px, which is upscaled to full resolution and snapped to real edges with an edge-aware guided filter.',
          '**Color key** — for green/blue screens and white, black or any solid backgrounds. Pick the color with the eyedropper, tune tolerance, softness, hue sensitivity and saturation threshold. **Protect subject interior** only removes regions connected to the border, so green inside the subject survives.',
          '**Pixel Art** — exact-color (or distance-limited) removal with binary alpha, nearest-neighbor preview and no new colors. Add several keys for checkerboard-style backgrounds.',
        ],
        p: ['The app picks a starting mode automatically by analysing the image border and its anti-aliasing.'],
      },
      { h: '2 · Refine and fix', p: ["Use **Edges** for alpha thresholds, shrink/expand, feathering, residue cleanup, hole filling, color decontamination and spill suppression. Use the **Eraser** and **Restore** brushes for anything automatic removal can't decide. Restored pixels always use the original pixel values. The mask view, red overlay and pixel inspector show exactly which pixels are transparent."] },
      { h: '3 · Export', p: ['PNG export uses a built-in lossless encoder that writes straight (un-premultiplied) RGBA, so every opaque pixel keeps its exact original RGB value and transparent pixels are written as fully transparent (0,0,0,0) — no background color is left behind and no checkerboard is ever baked in. Images are exported at the original resolution unless you choose another size.'] },
      { h: 'Limits, honestly', p: ['When the subject and background share the same colors and touch each other, no automatic method can separate them perfectly. Use the Restore brush to protect those areas (it also stops color keying from spreading into them). Animated GIFs: only the first frame is processed. Color profiles are not converted; values are kept as stored.'] },
      { h: 'Privacy', p: ['All decoding, AI inference and encoding happen locally. The default model is served by this app. Only if you select the optional RMBG-1.4 model are its weights downloaded from Hugging Face — your images are never uploaded.'] },
    ],
    shortcutsTitle: 'Keyboard shortcuts',
    shortcuts: [
      ['E / R', 'Eraser / Restore brush'],
      ['H, Space', 'Pan'],
      ['I', 'Eyedropper (Shift+click adds a pixel-art key color)'],
      ['[ / ]', 'Brush size'],
      ['Wheel, + / -', 'Zoom'],
      ['0 / 1', 'Fit to screen / 100%'],
      ['B / M', 'Comparison slider / Mask view'],
      ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / Redo'],
      ['Ctrl+S', 'Download'],
      ['Ctrl+V', 'Paste image from clipboard'],
    ],
  },
  es: {
    title: 'Cómo funciona MayinPix',
    sections: [
      {
        h: '1 · Elige un modo de eliminación',
        items: [
          '**IA** — un modelo de segmentación ISNet se ejecuta en tu navegador (WebGPU o WebAssembly). Predice una máscara suave a 1024 px, que se amplía a resolución completa y se ajusta a los bordes reales con un filtro guiado sensible a bordes.',
          '**Croma** — para pantallas verdes/azules y fondos blancos, negros o de cualquier color sólido. Elige el color con el cuentagotas y ajusta tolerancia, suavidad, sensibilidad al tono y umbral de saturación. **Proteger el interior del sujeto** solo elimina las zonas conectadas con el borde, así el verde dentro del sujeto se conserva.',
          '**Pixel Art** — eliminación por color exacto (o con distancia limitada), con transparencia binaria, vista previa por vecino más cercano y sin colores nuevos. Añade varias claves para fondos tipo cuadrícula.',
        ],
        p: ['La app elige automáticamente un modo inicial analizando el borde de la imagen y su antialiasing.'],
      },
      { h: '2 · Refina y corrige', p: ['Usa **Bordes** para umbrales alfa, contraer/expandir, difuminado, limpieza de restos, relleno de huecos, descontaminación de color y supresión de reflejos. Usa los pinceles **Borrador** y **Restaurar** para lo que la eliminación automática no pueda decidir. Los píxeles restaurados siempre usan los valores originales. La vista de máscara, la superposición roja y el inspector de píxeles muestran exactamente qué píxeles son transparentes.'] },
      { h: '3 · Exporta', p: ['La exportación PNG usa un codificador propio sin pérdida que escribe RGBA directo (sin premultiplicar): cada píxel opaco conserva exactamente su RGB original y los píxeles transparentes se escriben como totalmente transparentes (0,0,0,0). No queda color de fondo ni se incrusta ninguna cuadrícula. Las imágenes se exportan a la resolución original salvo que elijas otro tamaño.'] },
      { h: 'Límites, con honestidad', p: ['Cuando el sujeto y el fondo comparten colores y se tocan, ningún método automático puede separarlos a la perfección. Usa el pincel Restaurar para proteger esas zonas (también impide que la clave de color se extienda a ellas). GIF animados: solo se procesa el primer fotograma. Los perfiles de color no se convierten; los valores se mantienen tal como están guardados.'] },
      { h: 'Privacidad', p: ['Toda la decodificación, la inferencia de IA y la codificación ocurren localmente. El modelo predeterminado lo sirve esta app. Solo si eliges el modelo opcional RMBG-1.4 se descargan sus pesos desde Hugging Face; tus imágenes nunca se suben.'] },
    ],
    shortcutsTitle: 'Atajos de teclado',
    shortcuts: [
      ['E / R', 'Pincel Borrador / Restaurar'],
      ['H, Espacio', 'Mover'],
      ['I', 'Cuentagotas (Mayús+clic añade un color clave de pixel art)'],
      ['[ / ]', 'Tamaño del pincel'],
      ['Rueda, + / -', 'Zoom'],
      ['0 / 1', 'Ajustar a la pantalla / 100%'],
      ['B / M', 'Deslizador de comparación / Ver máscara'],
      ['Ctrl+Z / Ctrl+Shift+Z', 'Deshacer / Rehacer'],
      ['Ctrl+S', 'Descargar'],
      ['Ctrl+V', 'Pegar imagen del portapapeles'],
    ],
  },
  pt: {
    title: 'Como o MayinPix funciona',
    sections: [
      {
        h: '1 · Escolha um modo de remoção',
        items: [
          '**IA** — um modelo de segmentação ISNet roda no seu navegador (WebGPU ou WebAssembly). Ele prevê uma máscara suave em 1024 px, que é ampliada para a resolução total e ajustada às bordas reais com um filtro guiado sensível a bordas.',
          '**Chroma** — para telas verdes/azuis e fundos brancos, pretos ou de qualquer cor sólida. Escolha a cor com o conta-gotas e ajuste tolerância, suavidade, sensibilidade ao matiz e limite de saturação. **Proteger o interior do objeto** remove apenas regiões ligadas à borda, então o verde dentro do objeto é mantido.',
          '**Pixel Art** — remoção por cor exata (ou com distância limitada), com transparência binária, pré-visualização por vizinho mais próximo e sem cores novas. Adicione várias chaves para fundos quadriculados.',
        ],
        p: ['O app escolhe automaticamente um modo inicial analisando a borda da imagem e seu antialiasing.'],
      },
      { h: '2 · Refine e corrija', p: ['Use **Bordas** para limites alfa, contrair/expandir, suavização, limpeza de resíduos, preenchimento de buracos, descontaminação de cor e supressão de reflexo. Use os pincéis **Borracha** e **Restaurar** para o que a remoção automática não conseguir decidir. Pixels restaurados sempre usam os valores originais. A visualização da máscara, a sobreposição vermelha e o inspetor de pixels mostram exatamente quais pixels são transparentes.'] },
      { h: '3 · Exporte', p: ['A exportação PNG usa um codificador próprio sem perdas que grava RGBA direto (não pré-multiplicado): cada pixel opaco mantém exatamente seu RGB original e os pixels transparentes são gravados como totalmente transparentes (0,0,0,0). Não sobra cor de fundo nem quadriculado embutido. As imagens são exportadas na resolução original, a menos que você escolha outro tamanho.'] },
      { h: 'Limites, com honestidade', p: ['Quando o objeto e o fundo têm as mesmas cores e se tocam, nenhum método automático consegue separá-los perfeitamente. Use o pincel Restaurar para proteger essas áreas (ele também impede que a chave de cor se espalhe por elas). GIFs animados: apenas o primeiro quadro é processado. Perfis de cor não são convertidos; os valores são mantidos como estão gravados.'] },
      { h: 'Privacidade', p: ['Toda a decodificação, a inferência de IA e a codificação acontecem localmente. O modelo padrão é servido por este app. Só se você escolher o modelo opcional RMBG-1.4 os pesos dele são baixados do Hugging Face — suas imagens nunca são enviadas.'] },
    ],
    shortcutsTitle: 'Atalhos de teclado',
    shortcuts: [
      ['E / R', 'Pincel Borracha / Restaurar'],
      ['H, Espaço', 'Mover'],
      ['I', 'Conta-gotas (Shift+clique adiciona uma cor-chave de pixel art)'],
      ['[ / ]', 'Tamanho do pincel'],
      ['Roda, + / -', 'Zoom'],
      ['0 / 1', 'Ajustar à tela / 100%'],
      ['B / M', 'Controle de comparação / Ver máscara'],
      ['Ctrl+Z / Ctrl+Shift+Z', 'Desfazer / Refazer'],
      ['Ctrl+S', 'Baixar'],
      ['Ctrl+V', 'Colar imagem da área de transferência'],
    ],
  },
  fr: {
    title: 'Fonctionnement de MayinPix',
    sections: [
      {
        h: '1 · Choisissez un mode de suppression',
        items: [
          "**IA** — un modèle de segmentation ISNet s'exécute dans votre navigateur (WebGPU ou WebAssembly). Il prédit un masque doux à 1024 px, agrandi ensuite en pleine résolution et aligné sur les vrais contours grâce à un filtre guidé.",
          "**Incrustation** — pour les fonds verts/bleus et les fonds blancs, noirs ou de toute couleur unie. Prélevez la couleur à la pipette puis réglez la tolérance, la douceur, la sensibilité à la teinte et le seuil de saturation. **Protéger l'intérieur du sujet** ne supprime que les zones reliées au bord : le vert à l'intérieur du sujet est conservé.",
          '**Pixel Art** — suppression par couleur exacte (ou à distance limitée), transparence binaire, aperçu au plus proche voisin et aucune nouvelle couleur. Ajoutez plusieurs clés pour les fonds en damier.',
        ],
        p: ["L'application choisit automatiquement un mode de départ en analysant le bord de l'image et son anticrénelage."],
      },
      { h: '2 · Affinez et corrigez', p: ["Utilisez **Bords** pour les seuils alpha, rétrécir/étendre, l'adoucissement, le nettoyage des résidus, le comblement des trous, la décontamination et la suppression du débordement. Utilisez les pinceaux **Gomme** et **Restaurer** pour ce que la suppression automatique ne peut pas trancher. Les pixels restaurés reprennent toujours leurs valeurs d'origine. La vue du masque, la superposition rouge et l'inspecteur de pixels montrent exactement quels pixels sont transparents."] },
      { h: '3 · Exportez', p: ["L'export PNG utilise un encodeur intégré sans perte qui écrit du RVBA direct (non prémultiplié) : chaque pixel opaque garde exactement son RVB d'origine et les pixels transparents sont écrits entièrement transparents (0,0,0,0). Aucune couleur de fond ne subsiste et aucun damier n'est incrusté. Les images sont exportées à la résolution d'origine, sauf si vous choisissez une autre taille."] },
      { h: 'Limites, en toute honnêteté', p: ["Quand le sujet et le fond partagent les mêmes couleurs et se touchent, aucune méthode automatique ne peut les séparer parfaitement. Utilisez le pinceau Restaurer pour protéger ces zones (il empêche aussi l'incrustation de s'y propager). GIF animés : seule la première image est traitée. Les profils de couleur ne sont pas convertis ; les valeurs sont conservées telles quelles."] },
      { h: 'Confidentialité', p: ["Le décodage, l'inférence IA et l'encodage se font localement. Le modèle par défaut est servi par cette application. Les poids ne sont téléchargés depuis Hugging Face que si vous choisissez le modèle optionnel RMBG-1.4 — vos images ne sont jamais envoyées."] },
    ],
    shortcutsTitle: 'Raccourcis clavier',
    shortcuts: [
      ['E / R', 'Pinceau Gomme / Restaurer'],
      ['H, Espace', 'Déplacer'],
      ['I', 'Pipette (Maj+clic ajoute une couleur clé pixel art)'],
      ['[ / ]', 'Taille du pinceau'],
      ['Molette, + / -', 'Zoom'],
      ['0 / 1', "Ajuster à l'écran / 100 %"],
      ['B / M', 'Curseur de comparaison / Masque'],
      ['Ctrl+Z / Ctrl+Maj+Z', 'Annuler / Rétablir'],
      ['Ctrl+S', 'Télécharger'],
      ['Ctrl+V', 'Coller une image du presse-papiers'],
    ],
  },
};
