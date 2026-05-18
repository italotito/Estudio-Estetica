const PDFDocument = require('pdfkit');

/**
 * Gera um recibo PDF para um pagamento Pix
 * @param {Object} appointment - Os dados do agendamento
 * @returns {Promise<string>} - String Base64 do PDF gerado
 */
const generateReceiptBase64 = (appointment) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            let buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData.toString('base64'));
            });

            // Cores
            const colorPrimary = '#2c3e50';
            const colorSecondary = '#7f8c8d';
            const colorAccent = '#27ae60'; // Verde para sucesso

            // Título
            doc.fontSize(24)
                .fillColor(colorPrimary)
                .text('Comprovante de Pagamento Pix', { align: 'center' })
                .moveDown(0.5);

            // Divisor
            doc.moveTo(50, doc.y)
                .lineTo(545, doc.y)
                .strokeColor('#bdc3c7')
                .stroke()
                .moveDown(1.5);

            // Valor
            const value = parseFloat(appointment.paidValue || appointment.value).toFixed(2);
            doc.fontSize(32)
                .fillColor(colorAccent)
                .text(`R$ ${value}`, { align: 'center' })
                .moveDown(1);

            // Seção de detalhes
            doc.fontSize(14)
                .fillColor(colorPrimary)
                .text('Detalhes da Transação:', { underline: true })
                .moveDown(0.5);

            const paidAt = appointment.paidAt
                ? new Date(appointment.paidAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                : new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

            const drawDetailRow = (label, text) => {
                doc.fontSize(12).fillColor(colorSecondary).text(label, { continued: true });
                doc.fillColor(colorPrimary).text(` ${text}`);
                doc.moveDown(0.3);
            };

            drawDetailRow('ID da Transação:', appointment.endToEndId || 'N/A');
            drawDetailRow('Data/Hora:', paidAt);
            drawDetailRow('Serviço:', appointment.service);
            drawDetailRow('Ref. Interna:', appointment.id);

            doc.moveDown();

            // Dados do Cliente (Pagador)
            doc.fontSize(14)
                .fillColor(colorPrimary)
                .text('Dados do Cliente (Pagador):', { underline: true })
                .moveDown(0.5);

            drawDetailRow('Nome:', appointment.clientName);
            drawDetailRow('E-mail:', appointment.clientEmail || 'N/A');

            if (appointment.infoPagador) {
                drawDetailRow('Observação:', appointment.infoPagador);
            }

            doc.moveDown(2);

            // Rodapé
            doc.moveTo(50, doc.y)
                .lineTo(545, doc.y)
                .strokeColor('#bdc3c7')
                .stroke()
                .moveDown(1);

            doc.fontSize(10)
                .fillColor(colorSecondary)
                .text('Estúdio Estética', { align: 'center' })
                .text('Comprovante gerado automaticamente', { align: 'center' });

            doc.end();

        } catch (error) {
            reject(error);
        }
    });
};

module.exports = {
    generateReceiptBase64
};
