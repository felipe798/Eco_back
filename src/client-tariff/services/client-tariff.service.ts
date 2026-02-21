import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientTariffEntity } from '../entities/client-tariff.entity';
import { CreateClientTariffDto } from '../dto/create-client-tariff.dto';
import { UpdateClientTariffDto } from '../dto/update-client-tariff.dto';

@Injectable()
export class ClientTariffService {
  constructor(
    @InjectRepository(ClientTariffEntity)
    private readonly clientTariffRepository: Repository<ClientTariffEntity>,
  ) {}

  async create(createDto: CreateClientTariffDto): Promise<ClientTariffEntity> {
    const tariff = this.clientTariffRepository.create(createDto);
    return await this.clientTariffRepository.save(tariff);
  }

  async createBulk(createDtos: CreateClientTariffDto[]): Promise<ClientTariffEntity[]> {
    const tariffs = this.clientTariffRepository.create(createDtos);
    return await this.clientTariffRepository.save(tariffs);
  }

  async findAll(): Promise<ClientTariffEntity[]> {
    return await this.clientTariffRepository.find({
      order: { id: 'ASC' },
    });
  }

  async findOne(id: number): Promise<ClientTariffEntity> {
    const tariff = await this.clientTariffRepository.findOne({ where: { id } });
    if (!tariff) {
      throw new NotFoundException(`Tarifa con ID ${id} no encontrada`);
    }
    return tariff;
  }

  async findByRoute(partida: string, llegada: string, cliente: string): Promise<ClientTariffEntity | null> {
    return await this.clientTariffRepository.findOne({
      where: {
        cliente,
        partida,
        llegada,
      },
    });
  }

  /**
   * Búsqueda flexible: por cliente + partida (sin llegada)
   * Retorna todas las tarifas que coincidan
   */
  async findByClienteAndPartida(cliente: string, partida: string): Promise<ClientTariffEntity[]> {
    return await this.clientTariffRepository.find({
      where: {
        cliente,
        partida,
      },
    });
  }

  /**
   * Búsqueda flexible: por cliente + partida + material
   */
  async findByClientePartidaMaterial(cliente: string, partida: string, material: string): Promise<ClientTariffEntity | null> {
    return await this.clientTariffRepository.findOne({
      where: {
        cliente,
        partida,
        material,
      },
    });
  }

  async findByCliente(cliente: string): Promise<ClientTariffEntity[]> {
    return await this.clientTariffRepository.find({
      where: { cliente },
      order: { id: 'ASC' },
    });
  }

  async update(id: number, updateDto: UpdateClientTariffDto): Promise<ClientTariffEntity> {
    const tariff = await this.findOne(id);
    Object.assign(tariff, updateDto);
    return await this.clientTariffRepository.save(tariff);
  }

  async remove(id: number): Promise<void> {
    const tariff = await this.findOne(id);
    await this.clientTariffRepository.remove(tariff);
  }

  async removeAll(): Promise<void> {
    await this.clientTariffRepository.clear();
  }

  /**
   * Obtiene todos los valores únicos de cliente, partida, llegada y material
   * para usar en normalización de datos
   */
  async getUniqueValues(): Promise<{
    clientes: string[];
    partidas: string[];
    llegadas: string[];
    materiales: string[];
  }> {
    const tariffs = await this.clientTariffRepository.find();
    
    const clientes = [...new Set(tariffs.map(t => t.cliente))];
    const partidas = [...new Set(tariffs.map(t => t.partida))];
    const llegadas = [...new Set(tariffs.map(t => t.llegada))];
    const materiales = [...new Set(tariffs.map(t => t.material).filter(m => m && m.trim() !== ''))];

    return { clientes, partidas, llegadas, materiales };
  }
}
