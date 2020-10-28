import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const checkCustomerExists = await this.customersRepository.findById(
      customer_id,
    );

    if (!checkCustomerExists) {
      throw new AppError('Customer not found');
    }

    const checkProductsExists = await this.productsRepository.findAllById(
      products,
    );

    if (!checkProductsExists.length) {
      throw new AppError('Products not found');
    }

    const existentProductsIds = checkProductsExists.map(product => product.id);

    const checkInexistentProductsIds = products.filter(
      product => !existentProductsIds.includes(product.id),
    );

    if (checkInexistentProductsIds.length) {
      throw new AppError(
        `Could not find products with id ${checkInexistentProductsIds
          .map(product => product.id)
          .join(', ')}`,
      );
    }

    const findProductsWithNoQuantityAvailable = products.filter(product => {
      const compareProd = checkProductsExists.filter(p => p.id === product.id);
      return compareProd[0].quantity < product.quantity;
    });

    if (findProductsWithNoQuantityAvailable.length) {
      throw new AppError(
        `The quantity of the products with id ${findProductsWithNoQuantityAvailable
          .map(product => product.id)
          .join(', ')} are not available.`,
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: checkProductsExists.filter(p => p.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer: checkCustomerExists,
      products: serializedProducts,
    });

    const orderedProductsQuantity = products.map(el => {
      const compareProd = checkProductsExists.filter(x => x.id === el.id);
      const { name, price } = compareProd[0];
      const newQuantity = compareProd[0].quantity - el.quantity;
      return {
        id: el.id,
        name,
        price,
        quantity: newQuantity,
      };
    });

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
