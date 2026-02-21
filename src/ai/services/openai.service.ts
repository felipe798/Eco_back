import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import OpenAI from 'openai';
import { pdfToPng } from 'pdf-to-png-converter';

@Injectable()
export class OpenAIService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async convertPdfToImage(pdfBuffer: Buffer): Promise<string> {
    const arrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    );
    
    const pages = await pdfToPng(arrayBuffer as ArrayBuffer, {
      disableFontFace: false,
      useSystemFonts: true,
      viewportScale: 4.0,
      pagesToProcess: [1],
    });
    
    if (!pages || pages.length === 0) {
      throw new Error('No se pudo convertir el PDF a imagen');
    }

    return pages[0].content.toString('base64');
  }

  async extractDocumentData(pdfBuffer: Buffer): Promise<any> {
    try {
      const imageBase64 = await this.convertPdfToImage(pdfBuffer);

      const prompt = `Analiza esta imagen de un documento comercial de transporte de Perú (Guía de Remisión Transportista Electrónica) y extrae los datos solicitados en formato JSON.

IMPORTANTE: Extrae los valores EXACTAMENTE como aparecen en el documento, sin modificar, sin añadir ceros, sin cambiar el formato.

Campos a extraer del documento:
- fecha: Fecha de emisión (formato YYYY-MM-DD)
- mes: Mes en español (enero, febrero, etc.)
- semana: Número de semana ISO del año
- grt: Código de la guía EXACTAMENTE como aparece (ej: T001-123, VVV1-644, etc. - NO añadir ceros)
- transportista: Nombre de la empresa transportista
- unidad: Placa del vehículo principal
- empresa: Razón social del remitente
- tn_enviado: PESO BRUTO TOTAL (TNE) en toneladas (número decimal)
- deposito: Tipo de punto de partida (CONCESION, DEPOSITO, ALMACEN, PLANTA, MINA)
- grr: Código de documento relacionado (empieza con EG o GR)
- cliente: Razón social del destinatario
- partida: Punto de partida (DEPARTAMENTO - PROVINCIA - DISTRITO)
- llegada: Dirección completa del punto de llegada
- transportado: Descripción del producto en la tabla

Campos que SIEMPRE deben ser null (se ingresan manualmente del ticket físico):
- tn_recibida: null (viene del ticket)
- tn_recibida_data_cruda: null (viene del ticket)
- ticket: null (viene del ticket)

Campos financieros (siempre null, se calculan automáticamente):
- precio_unitario, divisa, precio_final, pcosto, divisa_cost, costo_final, margen_operativo

Responde SOLO con el JSON, sin texto adicional ni markdown:
{
  "mes": "...",
  "semana": "...",
  "fecha": "...",
  "grt": "...",
  "transportista": "...",
  "unidad": "...",
  "empresa": "...",
  "tn_enviado": null,
  "deposito": "...",
  "tn_recibida": null,
  "tn_recibida_data_cruda": null,
  "ticket": null,
  "grr": "...",
  "cliente": "...",
  "partida": "...",
  "llegada": "...",
  "transportado": "...",
  "precio_unitario": null,
  "divisa": null,
  "precio_final": null,
  "pcosto": null,
  "divisa_cost": null,
  "costo_final": null,
  "margen_operativo": null
}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'Eres un asistente de extracción de datos para documentos comerciales de logística. Tu trabajo es leer documentos de transporte (guías de remisión) y extraer información estructurada en formato JSON. Esto es para automatizar procesos administrativos de una empresa de transporte.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 2048,
        temperature: 0,
      });

      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('No se pudo extraer JSON válido de la respuesta de OpenAI');
      }

      const extractedData = JSON.parse(jsonMatch[0]);

      return {
        success: true,
        data: extractedData,
        rawResponse: content,
      };
    } catch (error) {
      throw new HttpException(
        {
          message: 'Error processing document with OpenAI',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
