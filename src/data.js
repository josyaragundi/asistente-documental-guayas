export const initialChats = [
  {
    id: "1",
    title: "Ideas para un portafolio",
    messages: [
      {
        role: "user",
        text: "Ayúdame a pensar una estructura para mi portafolio web.",
      },
      {
        role: "assistant",
        text: "Puedes empezar con una portada breve, un bloque de proyectos destacados, una sección de proceso y un contacto claro. Mantén cada proyecto con captura, problema, solución y resultado.",
      },
    ],
  },
  {
    id: "2",
    title: "Resumen de reunión",
    messages: [
      {
        role: "user",
        text: "Resume estos puntos: plazos, responsables y riesgos.",
      },
      {
        role: "assistant",
        text: "Plazos: entrega el viernes. Responsables: diseño y frontend. Riesgos: dependencias externas y contenido pendiente de aprobación.",
      },
    ],
  },
  {
    id: "3",
    title: "Consulta de CSS",
    messages: [
      {
        role: "user",
        text: "¿Cómo centro un layout de chat con sidebar?",
      },
      {
        role: "assistant",
        text: "Usa una cuadrícula de dos columnas para el escritorio y oculta el panel en móvil con un overlay. El hilo del chat puede ir centrado con un ancho máximo de unos 768px.",
      },
    ],
  },
];
