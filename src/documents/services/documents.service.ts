import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEntity } from '../entities/document.entity';
import { OpenAIService } from '../../ai/services/openai.service';
import { ClientTariffService } from '../../client-tariff/services/client-tariff.service';
import { UnidadService } from '../../unidad/services/unidad.service';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentEntity)
    private documentsRepository: Repository<DocumentEntity>,
    private openaiService: OpenAIService,
    private clientTariffService: ClientTariffService,
    private unidadService: UnidadService,
  ) {}

  async uploadAndProcessDocument(
    pdfBuffer: Buffer,
    fileName: string,
    userId: number,
    filePath: string,
  ): Promise<DocumentEntity> {
    try {
      // Enviar Buffer directamente a OpenAI (la conversión PDF→Imagen se hace internamente)
      const aiResponse = await this.openaiService.extractDocumentData(pdfBuffer);

      // Crear objeto con los datos extraídos
      const documentData: Partial<DocumentEntity> = {
        uploaded_by: userId,
        pdf_file_path: filePath,
        pdf_original_name: fileName,
        ...aiResponse.data,
      };

      // Normalizar campos de ubicación comparando con el tarifario
      await this.normalizeLocationFields(documentData);

      // Log para debugging
      console.log('=== DATOS DESPUÉS DE NORMALIZACIÓN ===');
      console.log('Cliente:', documentData.cliente);
      console.log('Partida:', documentData.partida);
      console.log('Llegada:', documentData.llegada);
      console.log('Transportado:', documentData.transportado);
      console.log('Empresa:', documentData.empresa);
      console.log('TN Recibida:', documentData.tn_recibida);

      // Calcular campos financieros basados en tarifario
      await this.calculateFinancialFields(documentData);

      // Buscar y asociar unidad (placa) con empresa de transporte
      await this.associateUnidad(documentData);

      // Log para debugging
      console.log('=== DATOS FINANCIEROS CALCULADOS ===');
      console.log('Precio Unitario:', documentData.precio_unitario);
      console.log('Divisa:', documentData.divisa);
      console.log('Precio Final:', documentData.precio_final);
      console.log('PCosto:', documentData.pcosto);
      console.log('Divisa Cost:', documentData.divisa_cost);
      console.log('Costo Final:', documentData.costo_final);
      console.log('Margen:', documentData.margen_operativo);
      console.log('=====================================');

      // Guardar en BD
      const document = this.documentsRepository.create(documentData);
      const savedDocument = await this.documentsRepository.save(document);

      // Asegurar que es una entidad simple, no un array
      return Array.isArray(savedDocument) ? savedDocument[0] : savedDocument;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Busca la placa en la tabla de unidades y asocia la empresa de transporte
   */
  private async associateUnidad(documentData: Partial<DocumentEntity>): Promise<void> {
    const { unidad } = documentData;

    if (!unidad) {
      console.log('=== No hay placa para asociar ===');
      return;
    }

    console.log('=== BUSCANDO UNIDAD ===');
    console.log('Placa extraída del PDF:', unidad);

    const unidadEncontrada = await this.unidadService.findByPlaca(unidad);

    if (unidadEncontrada) {
      documentData.unidadId = unidadEncontrada.id;
      // Actualizar el campo transportista con el nombre de la empresa
      if (unidadEncontrada.empresa) {
        documentData.transportista = unidadEncontrada.empresa.nombre;
        console.log('✓ Unidad encontrada:', unidadEncontrada.placa);
        console.log('✓ Empresa asociada:', unidadEncontrada.empresa.nombre);
      }
    } else {
      console.log('✗ Unidad no encontrada en la base de datos');
      console.log('Se mantendrá el transportista extraído del PDF');
    }

    console.log('=== FIN BÚSQUEDA UNIDAD ===\n');
  }

  /**
   * Normaliza los campos cliente, partida, llegada y transportado (material)
   * comparándolos con los valores del tarifario y ajustando al más parecido
   */
  private async normalizeLocationFields(documentData: Partial<DocumentEntity>): Promise<void> {
    const { cliente, partida, llegada, transportado, empresa } = documentData;

    // Obtener valores únicos del tarifario
    const uniqueValues = await this.clientTariffService.getUniqueValues();
    
    console.log('=== INICIANDO NORMALIZACIÓN ===');
    console.log('Valores originales:');
    console.log('  Cliente:', cliente);
    console.log('  Empresa:', empresa);
    console.log('  Partida:', partida);
    console.log('  Llegada:', llegada);
    console.log('  Transportado:', transportado);
    console.log('');
    console.log('Tarifario cargado:');
    console.log('  Clientes:', uniqueValues.clientes.length, uniqueValues.clientes);
    console.log('  Partidas:', uniqueValues.partidas.length, uniqueValues.partidas);
    console.log('  Llegadas:', uniqueValues.llegadas.length, uniqueValues.llegadas);
    console.log('  Materiales:', uniqueValues.materiales.length, uniqueValues.materiales);

    // Normalizar cliente - primero intentar con empresa (que suele ser el remitente real)
    console.log('\n--- Normalizando CLIENTE ---');
    let clienteNormalizado = false;
    
    // Primero intentar con empresa (remitente), ya que suele ser el cliente real
    if (empresa) {
      console.log('Probando con empresa:', empresa);
      const normalizedEmpresa = this.findBestMatch(empresa, uniqueValues.clientes);
      if (normalizedEmpresa) {
        documentData.cliente = normalizedEmpresa;
        clienteNormalizado = true;
      }
    }
    
    // Si no encontró con empresa, intentar con cliente
    if (!clienteNormalizado && cliente) {
      console.log('Probando con cliente:', cliente);
      const normalizedCliente = this.findBestMatch(cliente, uniqueValues.clientes);
      if (normalizedCliente) {
        documentData.cliente = normalizedCliente;
        clienteNormalizado = true;
      }
    }

    // Normalizar partida
    console.log('\n--- Normalizando PARTIDA ---');
    if (partida) {
      const normalizedPartida = this.findBestMatch(partida, uniqueValues.partidas);
      if (normalizedPartida) {
        documentData.partida = normalizedPartida;
      }
    }

    // Normalizar llegada
    console.log('\n--- Normalizando LLEGADA ---');
    if (llegada) {
      const normalizedLlegada = this.findBestMatch(llegada, uniqueValues.llegadas);
      if (normalizedLlegada) {
        documentData.llegada = normalizedLlegada;
      }
    }

    // Normalizar transportado (material) - buscar si algún material del tarifario está contenido
    console.log('\n--- Normalizando MATERIAL ---');
    if (transportado) {
      const normalizedMaterial = this.findMaterialMatch(transportado, uniqueValues.materiales);
      if (normalizedMaterial) {
        documentData.transportado = normalizedMaterial;
      }
    }
    
    console.log('=== FIN NORMALIZACIÓN ===\n');
  }

  /**
   * Busca si algún material del tarifario está contenido en el texto extraído
   * Ej: "POR CONCENTRADO DE ZN UN 3077 CLASE 9..." contiene "CONCENTRADO DE ZN"
   */
  private findMaterialMatch(input: string, materials: string[]): string | null {
    if (!input || materials.length === 0) {
      return null;
    }

    const normalizedInput = this.normalizeStringAggressive(input);
    
    // Primero buscar si algún material está contenido en el input
    for (const material of materials) {
      const normalizedMaterial = this.normalizeStringAggressive(material);
      if (normalizedMaterial && normalizedInput.includes(normalizedMaterial)) {
        console.log(`  ✓ Material encontrado por contenido: "${material}" en "${input.substring(0, 50)}..."`);
        return material;
      }
    }

    // Si no encontró match por contenido, usar similitud
    console.log(`  Buscando material por similitud...`);
    return this.findBestMatch(input, materials);
  }

  /**
   * Encuentra el valor más parecido en una lista usando múltiples estrategias:
   * 1. Match exacto normalizado (incluyendo normalización agresiva)
   * 2. Un string contiene al otro
   * 3. Palabras clave en común
   * 4. Similitud Levenshtein
   */
  private findBestMatch(input: string, candidates: string[]): string | null {
    if (!input || candidates.length === 0) {
      console.log(`  findBestMatch: input vacío o sin candidatos`);
      return null;
    }

    const normalizedInput = this.normalizeString(input);
    const aggressiveInput = this.normalizeStringAggressive(input);
    
    console.log(`  Buscando match para: "${input}"`);
    console.log(`  Normalizado: "${normalizedInput}"`);
    console.log(`  Agresivo: "${aggressiveInput}"`);
    console.log(`  Candidatos disponibles: ${candidates.length}`);
    
    let bestMatch: string | null = null;
    let bestScore = 0;
    const threshold = 0.6; // 60% de similitud mínima

    for (const candidate of candidates) {
      const normalizedCandidate = this.normalizeString(candidate);
      const aggressiveCandidate = this.normalizeStringAggressive(candidate);
      
      // 1. Match exacto (normal o agresivo)
      if (normalizedInput === normalizedCandidate || aggressiveInput === aggressiveCandidate) {
        console.log(`  ✓ Match exacto: "${input}" → "${candidate}"`);
        return candidate;
      }

      // 2. Un string contiene completamente al otro (usando normalización agresiva)
      if (aggressiveInput.includes(aggressiveCandidate) || aggressiveCandidate.includes(aggressiveInput)) {
        const minLen = Math.min(aggressiveInput.length, aggressiveCandidate.length);
        const maxLen = Math.max(aggressiveInput.length, aggressiveCandidate.length);
        const containScore = minLen / maxLen;
        console.log(`  Contenido encontrado: "${candidate}" score=${(containScore*100).toFixed(0)}%`);
        if (containScore > bestScore) {
          bestScore = containScore;
          bestMatch = candidate;
        }
        continue;
      }

      // 3. Palabras clave en común (útil para direcciones)
      const keywordScore = this.calculateKeywordOverlap(normalizedInput, normalizedCandidate);
      if (keywordScore > bestScore && keywordScore >= threshold) {
        bestScore = keywordScore;
        bestMatch = candidate;
        continue;
      }

      // 4. Similitud Levenshtein (usando normalización agresiva para mejor matching)
      const levenshteinScore = this.calculateSimilarity(aggressiveInput, aggressiveCandidate);
      if (levenshteinScore > bestScore) {
        bestScore = levenshteinScore;
        bestMatch = candidate;
      }
    }

    // Solo retornar si supera el umbral
    if (bestScore >= threshold && bestMatch) {
      console.log(`  ✓ Match por similitud (${(bestScore * 100).toFixed(0)}%): "${input}" → "${bestMatch}"`);
      return bestMatch;
    }
    
    console.log(`  ✗ Sin match para: "${input}" (mejor score: ${(bestScore * 100).toFixed(0)}%, candidato: "${bestMatch}")`);
    return null;
  }

  /**
   * Calcula el overlap de palabras clave entre dos strings
   * Retorna un valor entre 0 y 1
   */
  private calculateKeywordOverlap(str1: string, str2: string): number {
    const words1 = str1.split(/[\s-]+/).filter(w => w.length > 2);
    const words2 = str2.split(/[\s-]+/).filter(w => w.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return 0;

    let matches = 0;
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1 === word2 || word1.includes(word2) || word2.includes(word1)) {
          matches++;
          break;
        }
      }
    }

    // Promedio de overlap en ambas direcciones
    return matches / Math.max(words1.length, words2.length);
  }

  /**
   * Normaliza un string para comparación
   * Quita acentos, convierte a minúsculas, normaliza espacios y guiones
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
      .replace(/[^a-z0-9\s-]/g, '')    // Solo letras, números, espacios y guiones
      .replace(/\s*-\s*/g, '-')        // Normalizar espacios alrededor de guiones
      .replace(/\s+/g, ' ')            // Múltiples espacios a uno
      .trim();
  }

  /**
   * Normaliza un string de forma más agresiva (solo letras y números)
   * Útil para comparaciones donde los separadores varían
   */
  private normalizeStringAggressive(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
      .replace(/[^a-z0-9]/g, '');      // Solo letras y números, quitar TODO lo demás
  }

  /**
   * Calcula la similitud entre dos strings usando el algoritmo de Levenshtein
   * Retorna un valor entre 0 y 1 (1 = idénticos)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    // Algoritmo de Levenshtein
    const matrix: number[][] = [];

    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str2.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // eliminación
          matrix[i][j - 1] + 1,      // inserción
          matrix[i - 1][j - 1] + cost // sustitución
        );
      }
    }

    const distance = matrix[str1.length][str2.length];
    const maxLength = Math.max(str1.length, str2.length);
    
    return 1 - distance / maxLength;
  }

  /**
   * Calcula los campos financieros basados en el tarifario
   * Estrategia de búsqueda:
   * 1. Buscar por cliente + partida + llegada (exacto)
   * 2. Si no encuentra, buscar por cliente + partida + material
   * 3. Si no encuentra, buscar por cliente + partida (primera coincidencia)
   */
  private async calculateFinancialFields(documentData: Partial<DocumentEntity>): Promise<void> {
    const { cliente, partida, llegada, transportado, empresa, tn_recibida } = documentData;

    console.log('=== BUSCANDO TARIFA ===');
    console.log('Cliente:', cliente);
    console.log('Partida:', partida);
    console.log('Llegada:', llegada);
    console.log('Material:', transportado);

    // Si no hay datos suficientes para buscar, salir
    if (!cliente || !partida) {
      console.log('✗ Datos insuficientes para buscar tarifa');
      return;
    }

    let tarifa = null;

    // 1. Buscar por cliente + partida + llegada (exacto)
    if (llegada) {
      tarifa = await this.clientTariffService.findByRoute(partida, llegada, cliente);
      if (tarifa) {
        console.log('✓ Tarifa encontrada por cliente+partida+llegada');
      }
    }

    // 2. Si no encuentra y hay material, buscar por cliente + partida + material
    if (!tarifa && transportado) {
      tarifa = await this.clientTariffService.findByClientePartidaMaterial(cliente, partida, transportado);
      if (tarifa) {
        console.log('✓ Tarifa encontrada por cliente+partida+material');
        // Actualizar la llegada con la del tarifario
        documentData.llegada = tarifa.llegada;
      }
    }

    // 3. Si todavía no encuentra, buscar por cliente + partida (primera coincidencia)
    if (!tarifa) {
      const tarifas = await this.clientTariffService.findByClienteAndPartida(cliente, partida);
      if (tarifas.length > 0) {
        tarifa = tarifas[0];
        console.log('✓ Tarifa encontrada por cliente+partida (primera coincidencia)');
        // Actualizar la llegada con la del tarifario
        documentData.llegada = tarifa.llegada;
      }
    }

    if (tarifa) {
      console.log('Tarifa seleccionada:', {
        cliente: tarifa.cliente,
        partida: tarifa.partida,
        llegada: tarifa.llegada,
        material: tarifa.material,
        precioVenta: tarifa.precioVentaSinIgv,
        precioCosto: tarifa.precioCostoSinIgv,
      });

      // Asignar precio unitario y divisa desde tarifario
      documentData.precio_unitario = Number(tarifa.precioVentaSinIgv) || null;
      documentData.divisa = tarifa.moneda || null;

      // Asignar costo y divisa de costo desde tarifario
      documentData.pcosto = Number(tarifa.precioCostoSinIgv) || null;
      documentData.divisa_cost = tarifa.divisa || null;

      // Calcular precio final = precio_unitario * tn_recibida
      if (documentData.precio_unitario && tn_recibida) {
        documentData.precio_final = Number((documentData.precio_unitario * Number(tn_recibida)).toFixed(2));
      }

      // Calcular costo final
      // Fórmula Excel: =SI.ERROR(SI([@[Empresa]]<>"ECOTRANSPORTE",[@PCOSTO]*[@[TN RECIBIDA]],0),"")
      // Si transportista NO ES ECOTRANSPORTE → costo_final = pcosto * tn_recibida
      // Si transportista ES ECOTRANSPORTE → costo_final = 0
      const transportista = documentData.transportista || '';
      if (transportista.toUpperCase().includes('ECOTRANSPORTE')) {
        documentData.costo_final = 0;
        console.log('Transportista es ECOTRANSPORTE, costo_final = 0');
      } else if (documentData.pcosto && tn_recibida) {
        documentData.costo_final = Number((documentData.pcosto * Number(tn_recibida)).toFixed(2));
      }

      // Calcular margen operativo = precio_final - costo_final
      if (documentData.precio_final !== null && documentData.costo_final !== null) {
        documentData.margen_operativo = Number((documentData.precio_final - documentData.costo_final).toFixed(2));
      }
    } else {
      console.log('✗ No se encontró tarifa para esta combinación');
      // No se encontró tarifa, dejar campos en null
      documentData.precio_unitario = null;
      documentData.divisa = null;
      documentData.precio_final = null;
      documentData.pcosto = null;
      documentData.divisa_cost = null;
      documentData.costo_final = null;
      documentData.margen_operativo = null;
    }
    
    console.log('=== FIN BÚSQUEDA TARIFA ===\n');
  }

  async getDocumentById(id: number): Promise<DocumentEntity | null> {
    return await this.documentsRepository.findOne({
      where: { id },
      relations: ['uploader', 'uploader.userInformation', 'updater'],
    });
  }

  async getAllDocuments(): Promise<DocumentEntity[]> {
    return await this.documentsRepository.find({
      relations: ['uploader', 'uploader.userInformation'],
      order: { created_at: 'DESC' },
    });
  }

  async getDocumentsByUser(userId: number): Promise<DocumentEntity[]> {
    return await this.documentsRepository.find({
      where: { uploaded_by: userId },
      relations: ['uploader', 'uploader.userInformation'],
      order: { created_at: 'DESC' },
    });
  }

  async updateDocument(
    id: number,
    updateData: Partial<DocumentEntity>,
    userId?: number,
  ): Promise<DocumentEntity | null> {
    // Si se proporciona userId, guardarlo como updated_by
    if (userId) {
      updateData.updated_by = userId;
    }

    // Si se actualiza tn_recibida, recalcular campos financieros
    if (updateData.tn_recibida !== undefined) {
      const existingDoc = await this.getDocumentById(id);
      if (existingDoc) {
        const tn_recibida = Number(updateData.tn_recibida);
        
        // Recalcular precio_final = precio_unitario * tn_recibida
        if (existingDoc.precio_unitario) {
          updateData.precio_final = Number((existingDoc.precio_unitario * tn_recibida).toFixed(2));
        }

        // Recalcular costo_final
        // Si transportista es ECOTRANSPORTE, costo_final = 0
        // Sino, costo_final = pcosto * tn_recibida
        const transportista = existingDoc.transportista || '';
        if (transportista.toUpperCase().includes('ECOTRANSPORTE')) {
          updateData.costo_final = 0;
        } else if (existingDoc.pcosto) {
          updateData.costo_final = Number((existingDoc.pcosto * tn_recibida).toFixed(2));
        }

        // Recalcular margen_operativo = precio_final - costo_final
        const precioFinal = updateData.precio_final ?? existingDoc.precio_final ?? 0;
        const costoFinal = updateData.costo_final ?? existingDoc.costo_final ?? 0;
        updateData.margen_operativo = Number((precioFinal - costoFinal).toFixed(2));
      }
    }

    await this.documentsRepository.update(id, updateData);
    return await this.getDocumentById(id);
  }

  async deleteDocument(id: number): Promise<boolean> {
    const result = await this.documentsRepository.delete(id);
    return result.affected > 0;
  }
}
