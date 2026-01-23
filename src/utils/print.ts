// Utilitaires pour l'impression

export const printElement = (elementId: string, title: string = 'Document') => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error('Élément à imprimer non trouvé');
    return;
  }

  // Créer une nouvelle fenêtre pour l'impression
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    console.error('Impossible d\'ouvrir la fenêtre d\'impression');
    return;
  }

  // Styles pour l'impression
  const printStyles = `
    <style>
      * {
        box-sizing: border-box;
      }
      
      @media print {
        * {
          -webkit-print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        
        body {
          margin: 0;
          padding: 20px;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 11px;
          line-height: 1.4;
          color: #000;
          background: white !important;
        }
        
        .print-header {
          text-align: center;
          margin-bottom: 40px;
          border-bottom: 2px solid #000;
          padding-bottom: 20px;
        }
        
        .print-logo {
          max-height: 100px;
          margin-bottom: 15px;
        }
        
        .print-organization {
          font-size: 14px;
          font-weight: bold;
          color: #333;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .print-title {
          font-size: 20px;
          font-weight: bold;
          margin: 15px 0;
          color: #000;
        }
        
        .print-subtitle {
          font-size: 14px;
          margin-bottom: 8px;
          color: #333;
        }
        
        .print-date {
          font-size: 12px;
          color: #666;
          margin-bottom: 5px;
        }
        
        .print-content {
          margin: 20px 0;
        }
        
        .print-footer {
          margin-top: 40px;
          text-align: center;
          font-size: 9px;
          color: #666;
          border-top: 1px solid #ccc;
          padding-top: 15px;
          page-break-inside: avoid;
        }
        
        /* Masquer tous les éléments interactifs */
        .no-print,
        button,
        input,
        select,
        textarea,
        .hover\\:bg-gray-50,
        .transition-colors,
        .cursor-pointer,
        .scrollbar-thin,
        .overflow-x-auto,
        .overflow-y-auto,
        .transform,
        .hover\\:scale-\\[1\\.02\\],
        .hover\\:shadow-lg,
        .bg-gradient-to-r {
          display: none !important;
        }
        
        /* Styles pour les tableaux */
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
          font-size: 11px;
        }
        
        th, td {
          border: 1px solid #000;
          padding: 6px 8px;
          text-align: left;
          vertical-align: top;
        }
        
        th {
          background-color: #f0f0f0;
          font-weight: bold;
          text-align: center;
          font-size: 10px;
          text-transform: uppercase;
        }
        
        .print-amount {
          text-align: right;
          font-weight: bold;
        }
        
        .print-total-row {
          background-color: #f9f9f9;
          font-weight: bold;
        }
        
        /* Éviter les coupures de page dans les éléments importants */
        .print-section {
          page-break-inside: avoid;
        }
      }
    </style>
  `;

  // Contenu HTML pour l'impression
  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      ${printStyles}
    </head>
    <body>
      <div class="print-header">
        <div class="print-organization">
          CELLULE DE COORDINATION DE LA COOPÉRATION CÔTE D'IVOIRE-UNION EUROPÉENNE
        </div>
        <div class="print-title">${title}</div>
        <div class="print-date">Date d'impression : ${new Date().toLocaleDateString('fr-FR', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}</div>
      </div>
      
      <div class="print-content">
        ${element.innerHTML}
      </div>
      
      <div class="print-footer">
        <p>Document généré par la plateforme de gestion budgétaire</p>
        <p>BudgetBase - Système de Gestion Budgétaire</p>
      </div>
    </body>
    </html>
  `;

  // Écrire le contenu dans la nouvelle fenêtre
  printWindow.document.write(printContent);
  printWindow.document.close();

  // Attendre que le contenu soit chargé puis imprimer
  printWindow.onload = () => {
    printWindow.print();
    printWindow.close();
  };
};