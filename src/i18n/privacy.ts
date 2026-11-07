import type { Lang } from '@/store/studio';

export interface PrivacyContent {
  title: string;
  updated: string;
  sections: { h: string; p: string[]; adsOnly?: boolean }[];
}

const GOOGLE_PARTNERS = 'https://policies.google.com/technologies/partner-sites';
const AD_CENTER = 'https://myadcenter.google.com';
const GITHUB_PRIVACY = 'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement';

/** `[text](url)` renders as a link. */
export const PRIVACY: Record<Lang, PrivacyContent> = {
  en: {
    title: 'Privacy policy',
    updated: 'Last updated: November 7, 2026',
    sections: [
      { h: 'Your images', p: ['MayinPix processes images entirely inside your browser. Your images are never uploaded to any server, stored or shared by MayinPix. Background removal, AI inference and file export all run on your device.'] },
      { h: 'Data stored on your device', p: ['MayinPix stores your chosen language and theme in your browser (localStorage) and keeps a cached copy of the AI model (Cache Storage) so it does not need to be downloaded again. You can delete this data at any time by clearing your browser\'s site data.'] },
      { h: 'Hosting', p: [`The site is hosted on GitHub Pages. GitHub may record technical information such as IP addresses in server logs for security purposes. See the [GitHub Privacy Statement](${GITHUB_PRIVACY}).`] },
      { h: 'Optional AI model downloads', p: ['If you choose the optional BRIA RMBG-1.4 model, its weights are downloaded from Hugging Face. Only the model file is requested; your images are not sent.'] },
      {
        h: 'Advertising',
        adsOnly: true,
        p: [
          'This site shows ads served by Google AdSense. Google and its partners use cookies to serve ads based on your prior visits to this and other websites. Google\'s use of advertising cookies enables it and its partners to serve ads to you based on your visits to this site and/or other sites on the Internet.',
          `You can opt out of personalized advertising in [My Ad Center](${AD_CENTER}). Learn [how Google uses information from sites that use its services](${GOOGLE_PARTNERS}). Visitors in the EEA, the UK and Switzerland are asked for consent before personalized ads are shown.`,
        ],
      },
      { h: 'Contact', p: ['Questions about this policy can be sent through the project\'s GitHub page linked in the app\'s Help.'] },
    ],
  },
  es: {
    title: 'Política de privacidad',
    updated: 'Última actualización: 7 de noviembre de 2026',
    sections: [
      { h: 'Tus imágenes', p: ['MayinPix procesa las imágenes completamente dentro de tu navegador. Tus imágenes nunca se suben a ningún servidor, ni MayinPix las guarda ni las comparte. La eliminación de fondo, la IA y la exportación se ejecutan en tu dispositivo.'] },
      { h: 'Datos guardados en tu dispositivo', p: ['MayinPix guarda en tu navegador el idioma y el tema que elijas (localStorage) y una copia del modelo de IA (Cache Storage) para no tener que descargarlo de nuevo. Puedes borrar estos datos cuando quieras eliminando los datos del sitio en tu navegador.'] },
      { h: 'Alojamiento', p: [`El sitio está alojado en GitHub Pages. GitHub puede registrar información técnica, como direcciones IP, en sus registros del servidor por motivos de seguridad. Consulta la [Declaración de privacidad de GitHub](${GITHUB_PRIVACY}).`] },
      { h: 'Descargas opcionales de modelos de IA', p: ['Si eliges el modelo opcional BRIA RMBG-1.4, sus pesos se descargan desde Hugging Face. Solo se solicita el archivo del modelo; tus imágenes no se envían.'] },
      {
        h: 'Publicidad',
        adsOnly: true,
        p: [
          'Este sitio muestra anuncios servidos por Google AdSense. Google y sus socios usan cookies para mostrar anuncios basados en tus visitas anteriores a este y a otros sitios web. El uso de cookies publicitarias permite a Google y a sus socios mostrarte anuncios según tus visitas a este sitio y/o a otros sitios de Internet.',
          `Puedes desactivar la publicidad personalizada en [Mi Centro de anuncios](${AD_CENTER}). Consulta [cómo usa Google la información de los sitios que utilizan sus servicios](${GOOGLE_PARTNERS}). A los visitantes del EEE, el Reino Unido y Suiza se les pide su consentimiento antes de mostrar anuncios personalizados.`,
        ],
      },
      { h: 'Contacto', p: ['Puedes enviar preguntas sobre esta política a través de la página de GitHub del proyecto, enlazada en la Ayuda de la app.'] },
    ],
  },
  pt: {
    title: 'Política de privacidade',
    updated: 'Última atualização: 7 de novembro de 2026',
    sections: [
      { h: 'Suas imagens', p: ['O MayinPix processa as imagens inteiramente dentro do seu navegador. Suas imagens nunca são enviadas a nenhum servidor, nem armazenadas ou compartilhadas pelo MayinPix. A remoção de fundo, a IA e a exportação rodam no seu dispositivo.'] },
      { h: 'Dados guardados no seu dispositivo', p: ['O MayinPix guarda no seu navegador o idioma e o tema escolhidos (localStorage) e uma cópia do modelo de IA (Cache Storage) para não precisar baixá-lo de novo. Você pode apagar esses dados a qualquer momento limpando os dados do site no navegador.'] },
      { h: 'Hospedagem', p: [`O site é hospedado no GitHub Pages. O GitHub pode registrar informações técnicas, como endereços IP, nos logs do servidor por motivos de segurança. Veja a [Declaração de privacidade do GitHub](${GITHUB_PRIVACY}).`] },
      { h: 'Downloads opcionais de modelos de IA', p: ['Se você escolher o modelo opcional BRIA RMBG-1.4, os pesos são baixados do Hugging Face. Apenas o arquivo do modelo é solicitado; suas imagens não são enviadas.'] },
      {
        h: 'Publicidade',
        adsOnly: true,
        p: [
          'Este site exibe anúncios veiculados pelo Google AdSense. O Google e seus parceiros usam cookies para exibir anúncios com base nas suas visitas anteriores a este e a outros sites. O uso de cookies de publicidade permite que o Google e seus parceiros exibam anúncios com base nas suas visitas a este site e/ou a outros sites na Internet.',
          `Você pode desativar a publicidade personalizada na [Minha Central de anúncios](${AD_CENTER}). Saiba [como o Google usa as informações de sites que usam seus serviços](${GOOGLE_PARTNERS}). Visitantes do EEE, Reino Unido e Suíça recebem um pedido de consentimento antes de anúncios personalizados serem exibidos.`,
        ],
      },
      { h: 'Contato', p: ['Perguntas sobre esta política podem ser enviadas pela página do projeto no GitHub, indicada na Ajuda do app.'] },
    ],
  },
  fr: {
    title: 'Politique de confidentialité',
    updated: 'Dernière mise à jour : 7 novembre 2026',
    sections: [
      { h: 'Vos images', p: ["MayinPix traite les images entièrement dans votre navigateur. Vos images ne sont jamais envoyées à un serveur, ni conservées ni partagées par MayinPix. La suppression d'arrière-plan, l'IA et l'export s'exécutent sur votre appareil."] },
      { h: 'Données conservées sur votre appareil', p: ["MayinPix enregistre dans votre navigateur la langue et le thème choisis (localStorage) ainsi qu'une copie du modèle d'IA (Cache Storage) pour éviter de le retélécharger. Vous pouvez supprimer ces données à tout moment en effaçant les données du site dans votre navigateur."] },
      { h: 'Hébergement', p: [`Le site est hébergé sur GitHub Pages. GitHub peut enregistrer des informations techniques, comme les adresses IP, dans ses journaux de serveur à des fins de sécurité. Voir la [déclaration de confidentialité de GitHub](${GITHUB_PRIVACY}).`] },
      { h: "Téléchargements facultatifs de modèles d'IA", p: ["Si vous choisissez le modèle facultatif BRIA RMBG-1.4, ses poids sont téléchargés depuis Hugging Face. Seul le fichier du modèle est demandé ; vos images ne sont pas envoyées."] },
      {
        h: 'Publicité',
        adsOnly: true,
        p: [
          "Ce site affiche des annonces diffusées par Google AdSense. Google et ses partenaires utilisent des cookies pour diffuser des annonces en fonction de vos visites précédentes sur ce site et sur d'autres sites. Les cookies publicitaires permettent à Google et à ses partenaires de vous proposer des annonces selon vos visites sur ce site et/ou d'autres sites Internet.",
          `Vous pouvez désactiver la publicité personnalisée dans [Mon Centre publicitaire](${AD_CENTER}). Découvrez [comment Google utilise les informations des sites qui utilisent ses services](${GOOGLE_PARTNERS}). Les visiteurs de l'EEE, du Royaume-Uni et de Suisse sont invités à donner leur consentement avant l'affichage d'annonces personnalisées.`,
        ],
      },
      { h: 'Contact', p: ["Les questions sur cette politique peuvent être envoyées via la page GitHub du projet, indiquée dans l'Aide de l'application."] },
    ],
  },
};
